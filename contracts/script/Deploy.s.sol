// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SoulboundMemory} from "../src/SoulboundMemory.sol";

/// forge script script/Deploy.s.sol --rpc-url $XLAYER_RPC_URL --private-key $MINTER_PRIVATE_KEY --broadcast
contract DeployScript is Script {
    function run() external {
        address minter = vm.addr(vm.envUint("MINTER_PRIVATE_KEY"));
        vm.startBroadcast();
        SoulboundMemory nft = new SoulboundMemory(minter);
        vm.stopBroadcast();
        console.log("SoulboundMemory deployed at:", address(nft));
        console.log("Minter/owner:", minter);
    }
}
