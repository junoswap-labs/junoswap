// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "forge-std/Script.sol";
import "../src/BondingCurveJunoswap.sol";

contract DeployBondingCurveJunoswap is Script {
    // KUB Testnet addresses
    address constant WRAPPED_NATIVE = 0x700D3ba307E1256e509eD3E45D6f9dff441d6907; // tKKUB
    address constant V3_FACTORY = 0xCBd41F872FD46964bD4Be4d72a8bEBA9D656565b;
    address constant V3_POS_MANAGER = 0x690f45C21744eCC4ac0D897ACAC920889c3cFa4b;

    // Curve parameters
    uint256 constant INITIAL_NATIVE = 0;
    uint256 constant VIRTUAL_AMOUNT = 3400000000000000000000;
    uint256 constant GRADUATION_AMOUNT = 4000000000000000000000;

    // Fee parameters
    uint256 constant CREATE_FEE = 0.1 ether;
    uint256 constant PUMP_FEE = 100; // 1% in basis points

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        BondingCurveJunoswap pump = new BondingCurveJunoswap(
            WRAPPED_NATIVE,
            V3_FACTORY,
            V3_POS_MANAGER
        );

        pump.setCurveState(INITIAL_NATIVE, VIRTUAL_AMOUNT, GRADUATION_AMOUNT);
        pump.setFee(CREATE_FEE, PUMP_FEE);

        vm.stopBroadcast();

        console.log("BondingCurveJunoswap deployed at:", address(pump));
        console.log("feeCollector:", pump.feeCollector());
    }
}
