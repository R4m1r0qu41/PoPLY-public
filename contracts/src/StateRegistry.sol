// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import { CharacterKeys, SignatureChecker } from "./Common.sol";
import { IVerifierRegistry, IPoPLYCharacter } from "./interfaces/IPoPLY.sol";

contract StateRegistry {
    error ZeroAddress();
    error InvalidCommitment();
    error InvalidSequence(uint64 expected, uint64 received);
    error PlayTimeDecreased();
    error PlayTimeImplausible(uint64 maxAllowed, uint64 received);
    error PoPLDecreased();
    error PoPLImplausible(uint16 maxAllowed, uint16 received);
    error OccurredAtDecreased();
    error PayloadExpired();
    error OccurredInFuture();
    error WrongGame();
    error UnauthorizedVerifier();
    error AchievementAlreadyRecorded();

    string public constant NAME = "PoPLY State Registry";
    string public constant VERSION = "1";

    /// @notice Upper bound on how much play time a single checkpoint may add. Combined with the
    /// monotonic floor this prevents a checkpoint from jumping play time to an implausible value
    /// (e.g. type(uint64).max), which would permanently brick the character's checkpoint chain
    /// because every later checkpoint must be >= the stored value.
    uint64 public constant MAX_PLAY_TIME_DELTA = 24 hours;

    /// @notice Upper bound on how much PoPL a single checkpoint may add. PoPL is monotonic
    /// non-decreasing, so without a ceiling a checkpoint jumping to a huge value (up to the
    /// uint16 max) would freeze the character permanently. This is generous versus any realistic
    /// policy (the reference policy tops out at level 5) while blocking the brick vector.
    uint16 public constant MAX_POPL_DELTA = 32;

    bytes32 public constant CHECKPOINT_TYPEHASH = keccak256(
        "Checkpoint(address characterContract,uint256 tokenId,bytes32 gameId,uint64 sequence,bytes32 stateHash,uint64 playTimeSeconds,uint16 popl,bytes32 policyId,uint64 occurredAt,uint64 deadline)"
    );
    bytes32 public constant ACHIEVEMENT_TYPEHASH = keccak256(
        "Achievement(address characterContract,uint256 tokenId,bytes32 gameId,bytes32 achievementId,bytes32 evidenceHash,uint64 occurredAt,uint64 deadline)"
    );
    bytes32 private constant _DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );

    struct Checkpoint {
        address characterContract;
        uint256 tokenId;
        bytes32 gameId;
        uint64 sequence;
        bytes32 stateHash;
        uint64 playTimeSeconds;
        uint16 popl;
        bytes32 policyId;
        uint64 occurredAt;
        uint64 deadline;
    }

    struct Achievement {
        address characterContract;
        uint256 tokenId;
        bytes32 gameId;
        bytes32 achievementId;
        bytes32 evidenceHash;
        uint64 occurredAt;
        uint64 deadline;
    }

    struct CharacterState {
        uint64 sequence;
        uint64 playTimeSeconds;
        uint16 popl;
        uint64 occurredAt;
        bytes32 stateHash;
        bytes32 policyId;
        bytes32 checkpointDigest;
    }

    IVerifierRegistry public immutable verifierRegistry;
    bytes32 private immutable _hashedName;
    bytes32 private immutable _hashedVersion;

    mapping(bytes32 characterKey => CharacterState state) private _states;
    mapping(bytes32 characterKey => mapping(bytes32 achievementId => bool recorded)) public
        achievements;

    event CheckpointRecorded(
        address indexed characterContract,
        uint256 indexed tokenId,
        uint64 indexed sequence,
        bytes32 stateHash,
        uint64 playTimeSeconds,
        uint16 popl,
        bytes32 policyId,
        address verifier,
        bytes32 publisherId,
        bytes32 digest
    );
    event AchievementRecorded(
        address indexed characterContract,
        uint256 indexed tokenId,
        bytes32 indexed achievementId,
        bytes32 evidenceHash,
        address verifier,
        bytes32 publisherId,
        bytes32 digest
    );

    constructor(address registry) {
        if (registry == address(0)) revert ZeroAddress();
        verifierRegistry = IVerifierRegistry(registry);
        _hashedName = keccak256(bytes(NAME));
        _hashedVersion = keccak256(bytes(VERSION));
    }

    function submitCheckpoint(Checkpoint calldata checkpoint, bytes calldata signature)
        external
        returns (bytes32 digest)
    {
        _validateCharacter(checkpoint.characterContract, checkpoint.tokenId, checkpoint.gameId);
        if (checkpoint.stateHash == bytes32(0) || checkpoint.policyId == bytes32(0)) {
            revert InvalidCommitment();
        }
        if (block.timestamp > checkpoint.deadline) revert PayloadExpired();
        if (checkpoint.occurredAt > block.timestamp + 5 minutes) revert OccurredInFuture();

        bytes32 characterKey = keyOf(checkpoint.characterContract, checkpoint.tokenId);
        CharacterState storage current = _states[characterKey];
        _validateProgression(current, checkpoint);

        digest = checkpointDigest(checkpoint);
        address verifier = SignatureChecker.recover(digest, signature);
        if (!verifierRegistry.isVerifierForGame(verifier, checkpoint.gameId)) {
            revert UnauthorizedVerifier();
        }

        _states[characterKey] = CharacterState({
            sequence: checkpoint.sequence,
            playTimeSeconds: checkpoint.playTimeSeconds,
            popl: checkpoint.popl,
            occurredAt: checkpoint.occurredAt,
            stateHash: checkpoint.stateHash,
            policyId: checkpoint.policyId,
            checkpointDigest: digest
        });

        emit CheckpointRecorded(
            checkpoint.characterContract,
            checkpoint.tokenId,
            checkpoint.sequence,
            checkpoint.stateHash,
            checkpoint.playTimeSeconds,
            checkpoint.popl,
            checkpoint.policyId,
            verifier,
            verifierRegistry.publisherIdOf(verifier),
            digest
        );
    }

    function submitAchievement(Achievement calldata achievement, bytes calldata signature)
        external
        returns (bytes32 digest)
    {
        _validateCharacter(achievement.characterContract, achievement.tokenId, achievement.gameId);
        if (achievement.achievementId == bytes32(0) || achievement.evidenceHash == bytes32(0)) {
            revert InvalidCommitment();
        }
        if (block.timestamp > achievement.deadline) revert PayloadExpired();
        if (achievement.occurredAt > block.timestamp + 5 minutes) revert OccurredInFuture();

        bytes32 characterKey = keyOf(achievement.characterContract, achievement.tokenId);
        if (achievements[characterKey][achievement.achievementId]) {
            revert AchievementAlreadyRecorded();
        }

        digest = achievementDigest(achievement);
        address verifier = SignatureChecker.recover(digest, signature);
        if (!verifierRegistry.isVerifierForGame(verifier, achievement.gameId)) {
            revert UnauthorizedVerifier();
        }

        achievements[characterKey][achievement.achievementId] = true;
        emit AchievementRecorded(
            achievement.characterContract,
            achievement.tokenId,
            achievement.achievementId,
            achievement.evidenceHash,
            verifier,
            verifierRegistry.publisherIdOf(verifier),
            digest
        );
    }

    function stateOf(address characterContract, uint256 tokenId)
        external
        view
        returns (CharacterState memory)
    {
        return _states[keyOf(characterContract, tokenId)];
    }

    function poplOf(address characterContract, uint256 tokenId) external view returns (uint16) {
        return _states[keyOf(characterContract, tokenId)].popl;
    }

    function hasAchievement(address characterContract, uint256 tokenId, bytes32 achievementId)
        external
        view
        returns (bool)
    {
        return achievements[keyOf(characterContract, tokenId)][achievementId];
    }

    function checkpointDigest(Checkpoint calldata checkpoint) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                CHECKPOINT_TYPEHASH,
                checkpoint.characterContract,
                checkpoint.tokenId,
                checkpoint.gameId,
                checkpoint.sequence,
                checkpoint.stateHash,
                checkpoint.playTimeSeconds,
                checkpoint.popl,
                checkpoint.policyId,
                checkpoint.occurredAt,
                checkpoint.deadline
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
    }

    function achievementDigest(Achievement calldata achievement) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                ACHIEVEMENT_TYPEHASH,
                achievement.characterContract,
                achievement.tokenId,
                achievement.gameId,
                achievement.achievementId,
                achievement.evidenceHash,
                achievement.occurredAt,
                achievement.deadline
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(
            abi.encode(_DOMAIN_TYPEHASH, _hashedName, _hashedVersion, block.chainid, address(this))
        );
    }

    function keyOf(address characterContract, uint256 tokenId) public pure returns (bytes32) {
        return CharacterKeys.keyOf(characterContract, tokenId);
    }

    /// @notice Enforces the monotonic and plausibility invariants of a new checkpoint against the
    /// stored state: strictly increasing sequence, non-decreasing play time / PoPL / occurredAt,
    /// and a ceiling on how much a single checkpoint may add (so a bad value cannot brick the
    /// character by forcing every later checkpoint to exceed an implausible floor).
    function _validateProgression(CharacterState storage current, Checkpoint calldata checkpoint)
        private
        view
    {
        uint64 expected = current.sequence + 1;
        if (checkpoint.sequence != expected) revert InvalidSequence(expected, checkpoint.sequence);
        if (checkpoint.playTimeSeconds < current.playTimeSeconds) revert PlayTimeDecreased();
        uint64 maxPlayTime = current.playTimeSeconds + MAX_PLAY_TIME_DELTA;
        if (checkpoint.playTimeSeconds > maxPlayTime) {
            revert PlayTimeImplausible(maxPlayTime, checkpoint.playTimeSeconds);
        }
        if (checkpoint.popl < current.popl) revert PoPLDecreased();
        uint16 maxPopl = current.popl + MAX_POPL_DELTA;
        if (checkpoint.popl > maxPopl) revert PoPLImplausible(maxPopl, checkpoint.popl);
        if (checkpoint.occurredAt < current.occurredAt) revert OccurredAtDecreased();
    }

    function _validateCharacter(address characterContract, uint256 tokenId, bytes32 gameId)
        private
        view
    {
        if (characterContract == address(0)) revert ZeroAddress();
        // ownerOf also proves that the character exists.
        IPoPLYCharacter character = IPoPLYCharacter(characterContract);
        character.ownerOf(tokenId);
        if (character.gameIdOf(tokenId) != gameId) revert WrongGame();
    }
}
