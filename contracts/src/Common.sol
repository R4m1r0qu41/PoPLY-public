// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

abstract contract Owned {
    error NotOwner();
    error ZeroAddress();

    address public owner;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    constructor(address initialOwner) {
        if (initialOwner == address(0)) revert ZeroAddress();
        owner = initialOwner;
        emit OwnershipTransferred(address(0), initialOwner);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}

abstract contract ReentrancyGuard {
    error ReentrantCall();

    uint256 private _entered = 1;

    modifier nonReentrant() {
        if (_entered != 1) revert ReentrantCall();
        _entered = 2;
        _;
        _entered = 1;
    }
}

/// @notice Shared pull-payment credit escrow and protocol-fee configuration, factored out of
/// Licensing and Marketplace so the settlement invariants (credits are only paid out through
/// withdraw, a recipient callback can never block settlement, the fee is capped at 10%) live in
/// exactly one place.
abstract contract CreditEscrow is Owned, ReentrancyGuard {
    error NotCredited();
    error WithdrawalFailed();
    error InvalidFee();

    uint16 public protocolFeeBps;
    address public feeRecipient;

    mapping(address account => uint256 amount) public credits;

    event FeeConfigured(address indexed recipient, uint16 feeBps);
    event CreditWithdrawn(address indexed account, uint256 amount);

    function configureFee(address recipient, uint16 feeBps) external onlyOwner {
        _configureFee(recipient, feeBps);
    }

    function withdraw() external nonReentrant {
        uint256 amount = credits[msg.sender];
        if (amount == 0) revert NotCredited();
        credits[msg.sender] = 0;
        (bool success,) = msg.sender.call{ value: amount }("");
        if (!success) revert WithdrawalFailed();
        emit CreditWithdrawn(msg.sender, amount);
    }

    function _configureFee(address recipient, uint16 feeBps) internal {
        if (recipient == address(0)) revert ZeroAddress();
        if (feeBps > 1_000) revert InvalidFee();
        feeRecipient = recipient;
        protocolFeeBps = feeBps;
        emit FeeConfigured(recipient, feeBps);
    }
}

/// @notice Canonical `(characterContract, tokenId)` key derivation shared by every contract that
/// indexes per-character state, so the two can never drift apart.
library CharacterKeys {
    function keyOf(address characterContract, uint256 tokenId) internal pure returns (bytes32) {
        return keccak256(abi.encode(characterContract, tokenId));
    }
}

library SignatureChecker {
    error InvalidSignatureLength();
    error InvalidSignatureS();
    error InvalidSignatureV();
    error InvalidSignature();

    // secp256k1n / 2, used to reject malleable signatures.
    uint256 private constant _MAX_S =
        0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    function recover(bytes32 digest, bytes calldata signature)
        internal
        pure
        returns (address signer)
    {
        if (signature.length != 65) revert InvalidSignatureLength();

        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly ("memory-safe") {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }

        if (uint256(s) > _MAX_S) revert InvalidSignatureS();
        if (v != 27 && v != 28) revert InvalidSignatureV();

        signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert InvalidSignature();
    }
}
