// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "openzeppelin-contracts/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";

/// @title SoulboundMemory
/// @notice A precious-memory keepsake NFT that can never be transferred or
/// approved away once minted — it stays in the recipient's wallet permanently
/// (the whole point: "so you can't lose it"). Minting is restricted to the
/// Soulcanvas backend's minter wallet, which only mints after the buyer has
/// paid and explicitly confirmed the generated art.
contract SoulboundMemory is ERC721, Ownable {
    error TransfersDisabled();
    error AlreadyMinted(uint256 tokenId);

    uint256 private _nextTokenId;
    mapping(uint256 => string) private _tokenURIs;

    constructor(address minter) ERC721("Soulcanvas Memory", "MEMORY") Ownable(minter) {}

    /// @notice Mint a new memory NFT to `to`, only callable by the backend's minter wallet.
    function mint(address to, string calldata uri) external onlyOwner returns (uint256 tokenId) {
        tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        _tokenURIs[tokenId] = uri;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return _tokenURIs[tokenId];
    }

    /// @dev Soulbound: block every path that moves a token after mint —
    /// transferFrom, safeTransferFrom, and approve/setApprovalForAll (no point
    /// approving a spender when transfers themselves always revert, but
    /// disabling it too avoids a misleading "approved" state).
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        // Allow mint (from == address(0)); block every other transfer, including burns.
        if (from != address(0)) revert TransfersDisabled();
        return super._update(to, tokenId, auth);
    }

    function approve(address, uint256) public pure override {
        revert TransfersDisabled();
    }

    function setApprovalForAll(address, bool) public pure override {
        revert TransfersDisabled();
    }
}
