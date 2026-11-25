// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import { Owned } from "./Common.sol";
import {
    IERC165,
    IERC721,
    IERC721Metadata,
    IERC721Receiver,
    IItemLock
} from "./interfaces/IPoPLY.sol";

/// @notice Verified-Issuance item collection (RFC-009). Unlike CharacterNFT, dynamic progression
/// never attaches to an item: ERC-721 uniqueness *is* the anti-duplication guarantee, so the only
/// mutations are registry-driven — mint on an accepted issuance attestation, burn on destruction,
/// class update on transformation. The registry address is immutable for the same reason the
/// character's license manager is: there must be no window in which supply can change without a
/// publisher-signed attestation behind it.
contract ItemNFT is Owned, IERC721Metadata {
    error TokenDoesNotExist();
    error TokenAlreadyExists();
    error InvalidOwner();
    error InvalidReceiver();
    error NotAuthorized();
    error ItemLocked();

    struct Item {
        bytes32 gameId;
        bytes32 itemClassId;
        uint64 mintedAt;
    }

    string public name;
    string public symbol;

    /// @notice The only address that may mint, burn, or transform items. Immutable: item supply
    /// can only ever change through the registry's attestation checks.
    address public immutable itemRegistry;
    /// @notice Transfer lock consulted on every transfer — a bound item (see
    /// CharacterItemBinding) cannot move separately from its character. Immutable so the
    /// interlock, once deployed with it, can never be silently unset.
    IItemLock public immutable bindingManager;

    mapping(uint256 tokenId => address tokenOwner) private _owners;
    mapping(address tokenOwner => uint256 balance) private _balances;
    mapping(uint256 tokenId => address approved) private _tokenApprovals;
    mapping(address tokenOwner => mapping(address operator => bool approved)) private
        _operatorApprovals;
    mapping(uint256 tokenId => string uri) private _tokenURIs;
    mapping(uint256 tokenId => Item item) private _items;

    event ItemMinted(
        uint256 indexed tokenId, address indexed owner, bytes32 indexed gameId, bytes32 itemClassId
    );
    event ItemDestroyed(uint256 indexed tokenId);
    event ItemTransformed(uint256 indexed tokenId, bytes32 previousClassId, bytes32 newClassId);

    constructor(
        string memory collectionName,
        string memory collectionSymbol,
        address initialOwner,
        address initialItemRegistry,
        address initialBindingManager
    ) Owned(initialOwner) {
        if (initialItemRegistry == address(0) || initialBindingManager == address(0)) {
            revert ZeroAddress();
        }
        name = collectionName;
        symbol = collectionSymbol;
        itemRegistry = initialItemRegistry;
        bindingManager = IItemLock(initialBindingManager);
    }

    modifier onlyRegistry() {
        if (msg.sender != itemRegistry) revert NotAuthorized();
        _;
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IERC165).interfaceId || interfaceId == type(IERC721).interfaceId
            || interfaceId == type(IERC721Metadata).interfaceId;
    }

    function balanceOf(address tokenOwner) external view returns (uint256) {
        if (tokenOwner == address(0)) revert InvalidOwner();
        return _balances[tokenOwner];
    }

    function ownerOf(uint256 tokenId) public view returns (address tokenOwner) {
        tokenOwner = _owners[tokenId];
        if (tokenOwner == address(0)) revert TokenDoesNotExist();
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        ownerOf(tokenId);
        return _tokenURIs[tokenId];
    }

    function gameIdOf(uint256 tokenId) external view returns (bytes32) {
        ownerOf(tokenId);
        return _items[tokenId].gameId;
    }

    function itemClassOf(uint256 tokenId) external view returns (bytes32) {
        ownerOf(tokenId);
        return _items[tokenId].itemClassId;
    }

    function mintedAtOf(uint256 tokenId) external view returns (uint64) {
        ownerOf(tokenId);
        return _items[tokenId].mintedAt;
    }

    function mint(
        address to,
        uint256 tokenId,
        bytes32 gameId,
        bytes32 itemClassId,
        string calldata uri
    ) external onlyRegistry {
        if (to == address(0)) revert InvalidReceiver();
        if (_owners[tokenId] != address(0)) revert TokenAlreadyExists();
        if (gameId == bytes32(0) || itemClassId == bytes32(0)) revert InvalidOwner();

        _owners[tokenId] = to;
        unchecked {
            _balances[to] += 1;
        }
        _tokenURIs[tokenId] = uri;
        _items[tokenId] = Item(gameId, itemClassId, uint64(block.timestamp));

        emit Transfer(address(0), to, tokenId);
        emit ItemMinted(tokenId, to, gameId, itemClassId);

        if (to.code.length != 0) {
            bytes4 response =
                IERC721Receiver(to).onERC721Received(msg.sender, address(0), tokenId, "");
            if (response != IERC721Receiver.onERC721Received.selector) revert InvalidReceiver();
        }
    }

    /// @notice Destruction is terminal: the registry records the token as destroyed before calling
    /// so it can never be re-issued. A bound item cannot be destroyed out from under its binding.
    function burn(uint256 tokenId) external onlyRegistry {
        address tokenOwner = ownerOf(tokenId);
        if (_isLocked(tokenId)) revert ItemLocked();

        delete _tokenApprovals[tokenId];
        unchecked {
            _balances[tokenOwner] -= 1;
        }
        delete _owners[tokenId];
        delete _tokenURIs[tokenId];
        delete _items[tokenId];

        emit Transfer(tokenOwner, address(0), tokenId);
        emit ItemDestroyed(tokenId);
    }

    function transform(uint256 tokenId, bytes32 newItemClassId) external onlyRegistry {
        ownerOf(tokenId);
        if (newItemClassId == bytes32(0)) revert InvalidOwner();
        bytes32 previous = _items[tokenId].itemClassId;
        _items[tokenId].itemClassId = newItemClassId;
        emit ItemTransformed(tokenId, previous, newItemClassId);
    }

    function approve(address approved, uint256 tokenId) external {
        address tokenOwner = ownerOf(tokenId);
        if (msg.sender != tokenOwner && !_operatorApprovals[tokenOwner][msg.sender]) {
            revert NotAuthorized();
        }
        _tokenApprovals[tokenId] = approved;
        emit Approval(tokenOwner, approved, tokenId);
    }

    function setApprovalForAll(address operator, bool approved) external {
        if (operator == msg.sender) revert NotAuthorized();
        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function getApproved(uint256 tokenId) external view returns (address) {
        ownerOf(tokenId);
        return _tokenApprovals[tokenId];
    }

    function isApprovedForAll(address tokenOwner, address operator) external view returns (bool) {
        return _operatorApprovals[tokenOwner][operator];
    }

    function transferFrom(address from, address to, uint256 tokenId) public {
        address tokenOwner = ownerOf(tokenId);
        if (tokenOwner != from) revert InvalidOwner();
        if (to == address(0)) revert InvalidReceiver();
        if (!_isAuthorized(tokenOwner, tokenId, msg.sender)) revert NotAuthorized();
        if (_isLocked(tokenId)) revert ItemLocked();

        delete _tokenApprovals[tokenId];
        unchecked {
            _balances[from] -= 1;
            _balances[to] += 1;
        }
        _owners[tokenId] = to;

        emit Transfer(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        safeTransferFrom(from, to, tokenId, "");
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory data) public {
        transferFrom(from, to, tokenId);
        if (to.code.length != 0) {
            bytes4 response = IERC721Receiver(to).onERC721Received(msg.sender, from, tokenId, data);
            if (response != IERC721Receiver.onERC721Received.selector) revert InvalidReceiver();
        }
    }

    function _isAuthorized(address tokenOwner, uint256 tokenId, address operator)
        private
        view
        returns (bool)
    {
        return operator == tokenOwner || _tokenApprovals[tokenId] == operator
            || _operatorApprovals[tokenOwner][operator];
    }

    function _isLocked(uint256 tokenId) private view returns (bool) {
        return bindingManager.isItemLocked(address(this), tokenId);
    }
}

/// @notice Lock stub for deployments that opt out of the character–item interlock: ItemNFT's
/// binding manager is immutable and required, so "no interlock" is expressed by pointing it at
/// this contract rather than by a nullable address that could silently disable a real lock.
contract NullItemLock is IItemLock {
    function isItemLocked(address, uint256) external pure returns (bool) {
        return false;
    }
}
