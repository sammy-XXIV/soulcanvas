// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SoulboundMemory} from "../src/SoulboundMemory.sol";

contract SoulboundMemoryTest is Test {
    SoulboundMemory nft;
    address minter = address(0xBEEF);
    address buyer = address(0xCAFE);
    address stranger = address(0xDEAD);

    function setUp() public {
        nft = new SoulboundMemory(minter);
    }

    function test_mintAssignsOwnership() public {
        vm.prank(minter);
        uint256 tokenId = nft.mint(buyer, "ipfs://fake-uri");
        assertEq(nft.ownerOf(tokenId), buyer);
        assertEq(nft.tokenURI(tokenId), "ipfs://fake-uri");
    }

    function test_onlyMinterCanMint() public {
        vm.prank(stranger);
        vm.expectRevert();
        nft.mint(buyer, "ipfs://fake-uri");
    }

    function test_transferFromReverts() public {
        vm.prank(minter);
        uint256 tokenId = nft.mint(buyer, "ipfs://fake-uri");

        vm.prank(buyer);
        vm.expectRevert(SoulboundMemory.TransfersDisabled.selector);
        nft.transferFrom(buyer, stranger, tokenId);
    }

    function test_safeTransferFromReverts() public {
        vm.prank(minter);
        uint256 tokenId = nft.mint(buyer, "ipfs://fake-uri");

        vm.prank(buyer);
        vm.expectRevert(SoulboundMemory.TransfersDisabled.selector);
        nft.safeTransferFrom(buyer, stranger, tokenId);
    }

    function test_approveReverts() public {
        vm.prank(minter);
        uint256 tokenId = nft.mint(buyer, "ipfs://fake-uri");

        vm.prank(buyer);
        vm.expectRevert(SoulboundMemory.TransfersDisabled.selector);
        nft.approve(stranger, tokenId);
    }

    function test_setApprovalForAllReverts() public {
        vm.prank(buyer);
        vm.expectRevert(SoulboundMemory.TransfersDisabled.selector);
        nft.setApprovalForAll(stranger, true);
    }

    function test_ownerEvenAfterFailedTransferAttempt() public {
        vm.prank(minter);
        uint256 tokenId = nft.mint(buyer, "ipfs://fake-uri");

        vm.prank(buyer);
        vm.expectRevert(SoulboundMemory.TransfersDisabled.selector);
        nft.transferFrom(buyer, stranger, tokenId);

        // Ownership must be completely unchanged after the reverted attempt.
        assertEq(nft.ownerOf(tokenId), buyer);
    }

    function test_multipleMintsGetDistinctIds() public {
        vm.startPrank(minter);
        uint256 id1 = nft.mint(buyer, "uri1");
        uint256 id2 = nft.mint(buyer, "uri2");
        vm.stopPrank();

        assertTrue(id1 != id2);
        assertEq(nft.ownerOf(id1), buyer);
        assertEq(nft.ownerOf(id2), buyer);
    }
}
