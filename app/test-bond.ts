import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import * as fs from 'fs';
import * as anchor from "@coral-xyz/anchor";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { ReDao, IDL } from '../target/types/re_dao'
import * as bs58 from "bs58";
import * as crypto from 'crypto';
import { TOKEN_PROGRAM_ID, createAssociatedTokenAccount, createMint, getAccount, getAssociatedTokenAddressSync, getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token';
import { token } from "@coral-xyz/anchor/dist/cjs/utils";

async function testBond() {
    var kpJson = JSON.parse(fs.readFileSync("/home/ldev/.config/solana/id.json").toString());
    var kp = Keypair.fromSecretKey(new Uint8Array(kpJson));
    let walletWrapper = new anchor.Wallet(kp)
    //current devnet program
    let program_id = new anchor.web3.PublicKey("2HwuzQnLG3HznwMPh6TNT3v1P5Pb1EWujLrzTrFgYWZT");
    const solConnection = new anchor.web3.Connection("https://api.devnet.solana.com");
    const provider = new anchor.AnchorProvider(solConnection, walletWrapper, {
        preflightCommitment: 'recent',
    });
    const idl = IDL as ReDao
    const program = new anchor.Program<ReDao>(idl, program_id, provider);

    //ID of bonding instance
    const ID = "234f3e"

    //ID of root
    const TRACKER_ID = "8b0ba"

    let [tokenTrackerBaseAddress, tokenTrackerBaseBump] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from(TRACKER_ID)],
        program.programId
    );
    let [tokenStateAddress, tokenStateBump] = anchor.web3.PublicKey.findProgramAddressSync(
        [tokenTrackerBaseAddress.toBuffer(), Buffer.from(ID)],
        program.programId
    );
    //bond amount in lamports
    const bondingAmount = 0.01 * LAMPORTS_PER_SOL
    //bonding period
    const periodIndex = 0;
    //random id for coupon, if user has many coupons maybe check if the id already exists
    const couponId = crypto.randomBytes(20).toString('hex').slice(0, 10);
    //fetch the tokenstate and get addresses from there
    let tokenState = await program.account.tokenState.fetch(tokenStateAddress)
    let quoteMintTokenAddrRes = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        (provider.wallet as NodeWallet).payer,
        tokenState.quoteMintAddress,
        provider.wallet.publicKey
    )
    let baseMintTokenAddress = getAssociatedTokenAddressSync(tokenState.baseMintAddress, provider.wallet.publicKey)
    let [couponAddress, couponBump] = anchor.web3.PublicKey.findProgramAddressSync(
        [tokenStateAddress.toBuffer(), provider.wallet.publicKey.toBuffer(), Buffer.from(couponId)],
        program.programId
    );
    let voteAccount1Id = "0|DAPE"
    let [bondVoteAddress1, bondVoteBump1] = anchor.web3.PublicKey.findProgramAddressSync(
        [tokenStateAddress.toBuffer(), Buffer.from(voteAccount1Id)],
        program.programId
    );

    let tx = await program.methods.bond(couponId, new anchor.BN(bondingAmount), periodIndex).accounts({
        user: provider.wallet.publicKey,
        tokenTrackerBase: tokenTrackerBaseAddress,
        tokenState: tokenStateAddress,
        userQuoteToken: quoteMintTokenAddrRes.address,
        quoteRunwayTokenAddress: tokenState.quoteRunwayTokenAddress,
        quoteReserveTokenAddress: tokenState.quoteReserveTokenAddress,
        quoteSurplusTokenAddress: tokenState.quoteSurplusTokenAddress,
        coupon: couponAddress,
        bondVote: bondVoteAddress1,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
    }).rpc({ skipPreflight: true })
    console.log("Your transaction signature", tx);
    await new Promise(r => setTimeout(r, 13000));
    //get the available coupons
    let coupons = await program.account.bondCoupon.all([
        {
            memcmp: {
                offset: 8 + 8 + 1 + 1 + 8 + 8,
                bytes: provider.wallet.publicKey.toBase58()
            }
        },
        {
            memcmp: {
                offset: 8 + 8 + 1 + 1 + 8 + 8 + 32,
                bytes: tokenStateAddress.toBase58()
            }
        }
    ])

    console.log(coupons)
    for (let index = 0; index < coupons.length; index++) {
        const coupon = coupons[index];
        let couponId = String.fromCharCode(...coupon.account.id).trim()
        console.log(`State address: ${coupon.account.tokenStateAddress.toBase58()} Redeemer address: ${coupon.account.redeemerAddress.toBase58()} Id: ${couponId}`)
        let [tokenTrackerBaseAddress, tokenTrackerBaseBump] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from(TRACKER_ID)],
            program.programId
        );
        let [tokenStateAddress, tokenStateBump] = anchor.web3.PublicKey.findProgramAddressSync(
            [tokenTrackerBaseAddress.toBuffer(), Buffer.from(ID)],
            program.programId
        );
        let [couponAddress, couponBump] = anchor.web3.PublicKey.findProgramAddressSync(
            [tokenStateAddress.toBuffer(), provider.wallet.publicKey.toBuffer(), Buffer.from(String.fromCharCode(...coupon.account.id).trim())],
            program.programId
        );
        let [baseTokenAddress, baseTokenBump] = anchor.web3.PublicKey.findProgramAddressSync(
            [tokenStateAddress.toBuffer(), Buffer.from("base_token")],
            program.programId
        );
        let tx = await program.methods.redeem(couponId).accounts({
            user: provider.wallet.publicKey,
            tokenTrackerBase: tokenTrackerBaseAddress,
            tokenState: tokenStateAddress,
            userBaseToken: baseMintTokenAddress,
            baseTokenVault: baseTokenAddress,
            coupon: couponAddress,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: anchor.web3.SystemProgram.programId,
        }).rpc()
        console.log("Claim tx", tx)
        const couponRes = await program.account.bondCoupon.fetch(couponAddress)
        console.log("Coupon claimed:", couponRes.isRedeemed)
    }

}

testBond()