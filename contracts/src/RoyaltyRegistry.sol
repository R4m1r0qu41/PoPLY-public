// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import { IRoyaltyRegistry } from "./interfaces/IPoPLY.sol";

/// @notice Immutable per-collection royalty records. A collection can configure
/// its own token exactly once; no administrator can later redirect the royalty.
contract RoyaltyRegistry is IRoyaltyRegistry {
    error InvalidRoyalty();
    error RoyaltyAlreadyConfigured();

    struct Royalty {
        address receiver;
        uint16 bps;
        bool configured;
    }

    mapping(address collection => mapping(uint256 tokenId => Royalty royalty)) private _royalties;

    event RoyaltyConfigured(
        address indexed collection,
        uint256 indexed tokenId,
        address indexed receiver,
        uint16 royaltyBps
    );

    function configureRoyalty(uint256 tokenId, address receiver, uint16 royaltyBps) external {
        if (royaltyBps > 10_000 || (royaltyBps != 0 && receiver == address(0))) {
            revert InvalidRoyalty();
        }
        Royalty storage royalty = _royalties[msg.sender][tokenId];
        if (royalty.configured) revert RoyaltyAlreadyConfigured();
        royalty.receiver = receiver;
        royalty.bps = royaltyBps;
        royalty.configured = true;
        emit RoyaltyConfigured(msg.sender, tokenId, receiver, royaltyBps);
    }

    function royaltyInfo(address collection, uint256 tokenId, uint256 salePrice)
        external
        view
        returns (address receiver, uint256 royaltyAmount)
    {
        Royalty storage royalty = _royalties[collection][tokenId];
        receiver = royalty.receiver;
        royaltyAmount = salePrice * royalty.bps / 10_000;
    }
}
