// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import { Owned } from "./Common.sol";
import {
    IERC165,
    IERC721,
    IERC721Metadata,
    IERC721Receiver,
    IERC2981,
    ICharacterLock,
    IRoyaltyRegistry
} from "./interfaces/IPoPLY.sol";

contract CharacterNFT is Owned, IERC721Metadata, IERC2981 {
    error TokenDoesNotExist();
    error TokenAlreadyExists();
    error InvalidOwner();
    error InvalidReceiver();
    error NotAuthorized();
    error CharacterLocked();
    error InvalidRoyalty();

    struct Character {
        bytes32 gameId;
        bytes32 metadataCommitment;
        uint64 mintedAt;
    }

    string public name;
    string public symbol;

    mapping(uint256 tokenId => address tokenOwner) private _owners;
    mapping(address tokenOwner => uint256 balance) private _balances;
    mapping(uint256 tokenId => address approved) private _tokenApprovals;
    mapping(address tokenOwner => mapping(address operator => bool approved)) private
        _operatorApprovals;
    mapping(uint256 tokenId => string uri) private _tokenURIs;
    mapping(uint256 tokenId => Character character) private _characters;
    mapping(address minter => bool allowed) public minters;

    ICharacterLock public immutable licenseManager;
    IRoyaltyRegistry public immutable royaltyRegistry;

    event MinterConfigured(address indexed minter, bool allowed);
    event CharacterMinted(
        uint256 indexed tokenId,
        address indexed owner,
        bytes32 indexed gameId,
        bytes32 metadataCommitment
    );

    constructor(
        string memory collectionName,
        string memory collectionSymbol,
        address initialOwner,
        address initialRoyaltyRegistry,
        address initialLicenseManager
    ) Owned(initialOwner) {
        if (initialRoyaltyRegistry == address(0) || initialLicenseManager == address(0)) {
            revert ZeroAddress();
        }
        name = collectionName;
        symbol = collectionSymbol;
        royaltyRegistry = IRoyaltyRegistry(initialRoyaltyRegistry);
        // Immutable so the transfer lock can never be unset or repointed at a rogue manager, and
        // so there is no pre-configuration window in which an active license fails to lock the NFT.
        licenseManager = ICharacterLock(initialLicenseManager);
        minters[initialOwner] = true;
        emit MinterConfigured(initialOwner, true);
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IERC165).interfaceId || interfaceId == type(IERC721).interfaceId
            || interfaceId == type(IERC721Metadata).interfaceId
            || interfaceId == type(IERC2981).interfaceId;
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
        return _characters[tokenId].gameId;
    }

    function metadataCommitmentOf(uint256 tokenId) external view returns (bytes32) {
        ownerOf(tokenId);
        return _characters[tokenId].metadataCommitment;
    }

    function mintedAtOf(uint256 tokenId) external view returns (uint64) {
        ownerOf(tokenId);
        return _characters[tokenId].mintedAt;
    }

    function configureMinter(address minter, bool allowed) external onlyOwner {
        if (minter == address(0)) revert ZeroAddress();
        minters[minter] = allowed;
        emit MinterConfigured(minter, allowed);
    }

    function mint(
        address to,
        uint256 tokenId,
        bytes32 gameId,
        bytes32 metadataCommitment,
        string calldata uri,
        address royaltyReceiver,
        uint16 royaltyBps
    ) external {
        if (!minters[msg.sender]) revert NotAuthorized();
        if (to == address(0)) revert InvalidReceiver();
        if (_owners[tokenId] != address(0)) revert TokenAlreadyExists();
        if (gameId == bytes32(0) || metadataCommitment == bytes32(0)) revert InvalidOwner();
        if (royaltyBps > 10_000 || (royaltyBps != 0 && royaltyReceiver == address(0))) {
            revert InvalidRoyalty();
        }

        _owners[tokenId] = to;
        unchecked {
            _balances[to] += 1;
        }
        _tokenURIs[tokenId] = uri;
        _characters[tokenId] = Character(gameId, metadataCommitment, uint64(block.timestamp));
        royaltyRegistry.configureRoyalty(tokenId, royaltyReceiver, royaltyBps);

        emit Transfer(address(0), to, tokenId);
        emit CharacterMinted(tokenId, to, gameId, metadataCommitment);

        if (to.code.length != 0) {
            bytes4 response =
                IERC721Receiver(to).onERC721Received(msg.sender, address(0), tokenId, "");
            if (response != IERC721Receiver.onERC721Received.selector) revert InvalidReceiver();
        }
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
        if (_isLocked(tokenId)) revert CharacterLocked();

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

    function royaltyInfo(uint256 tokenId, uint256 salePrice)
        external
        view
        returns (address receiver, uint256 royaltyAmount)
    {
        ownerOf(tokenId);
        return royaltyRegistry.royaltyInfo(address(this), tokenId, salePrice);
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
        // licenseManager is immutable and non-zero, so the lock is always enforced.
        return licenseManager.isCharacterLocked(address(this), tokenId);
    }
}
