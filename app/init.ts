import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import * as fs from 'fs';
import * as anchor from "@coral-xyz/anchor";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { ReDao, IDL } from '../target/types/re_dao'
import * as bs58 from "bs58";
import * as crypto from 'crypto';
import { TOKEN_PROGRAM_ID, createAssociatedTokenAccount, createMint, getAccount, getAssociatedTokenAddressSync, mintTo } from '@solana/spl-token';

async function initialize() {
    var kpJson = JSON.parse(fs.readFileSync("/home/ldev/.config/solana/id.json").toString());
    var kp = Keypair.fromSecretKey(new Uint8Array(kpJson));
    let walletWrapper = new anchor.Wallet(kp)
    let program_id = new anchor.web3.PublicKey("2HwuzQnLG3HznwMPh6TNT3v1P5Pb1EWujLrzTrFgYWZT");
    const solConnection = new anchor.web3.Connection("https://api.devnet.solana.com");
    const provider = new anchor.AnchorProvider(solConnection, walletWrapper, {
        preflightCommitment: 'recent',
    });
    const idl = IDL as ReDao
    const program = new anchor.Program<ReDao>(idl, program_id, provider);

    const daoReserveWallet = await getSolanaKeypair("keys/reserve.json")
    let daoReserveTokenAddress = null;
    const daoSurplusWallet = await getSolanaKeypair("keys/surplus.json")
    let daoSurplusTokenAddress = null;
    const daoRunwayWallet = await getSolanaKeypair("keys/runway.json")
    let daoRunwayTokenAddress = null;

    const ID = crypto.randomBytes(20).toString('hex').slice(0, 6);
    const TRACKER_ID = crypto.randomBytes(20).toString('hex').slice(0, 5);

    console.log("ID", ID)
    console.log("Tracker ID", TRACKER_ID)
    //Quote mints
    let quoteMint = await createMint(
        program.provider.connection,
        (provider.wallet as NodeWallet).payer,
        provider.wallet.publicKey,
        provider.wallet.publicKey,
        9
    )
    let quoteMintTokenAddrRes = await createAssociatedTokenAccount(
        provider.connection,
        (provider.wallet as NodeWallet).payer,
        quoteMint,
        provider.wallet.publicKey
    )
    let quoteMintTokenAddr = quoteMintTokenAddrRes;
    await mintTo(
        provider.connection,
        (provider.wallet as NodeWallet).payer,
        quoteMint,
        quoteMintTokenAddr,
        (provider.wallet as NodeWallet).payer,
        100_000 * LAMPORTS_PER_SOL
    );
    let quotefaucetTokenAddrRes = await createAssociatedTokenAccount(
        provider.connection,
        (provider.wallet as NodeWallet).payer,
        quoteMint,
        new PublicKey("HMzw18rMyi4W5WDtKhLAVigorFtrtTG4x1B9eCzqvkC4")
    )
    let quotefaucetTokenAddr = quotefaucetTokenAddrRes;
    await mintTo(
        provider.connection,
        (provider.wallet as NodeWallet).payer,
        quoteMint,
        quotefaucetTokenAddr,
        (provider.wallet as NodeWallet).payer,
        100_00000 * LAMPORTS_PER_SOL
    );
    //Base mints
    let baseMint = await createMint(
        program.provider.connection,
        (provider.wallet as NodeWallet).payer,
        provider.wallet.publicKey,
        provider.wallet.publicKey,
        9
    )
    let baseMintTokenAddrRes = await createAssociatedTokenAccount(
        provider.connection,
        (provider.wallet as NodeWallet).payer,
        baseMint,
        provider.wallet.publicKey
    )
    let baseMintTokenAddr = baseMintTokenAddrRes;
    await mintTo(
        provider.connection,
        (provider.wallet as NodeWallet).payer,
        baseMint,
        baseMintTokenAddr,
        (provider.wallet as NodeWallet).payer,
        16_000_000_00 * LAMPORTS_PER_SOL
    );

    let [tokenTrackerBaseAddress, tokenTrackerBaseBump] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from(TRACKER_ID)],
        program.programId
    );

    const tx = await program.methods
        .createBaseTracker(TRACKER_ID)
        .accounts({
            creator: provider.wallet.publicKey,
            tokenTrackerBase: tokenTrackerBaseAddress,
            paymentMint: quoteMint,
            paymentTokenAddress: quoteMintTokenAddr,
            systemProgram: anchor.web3.SystemProgram.programId,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .rpc();

    const trackerBase = await program.account.tokenTrackerBase.fetch(tokenTrackerBaseAddress)
    console.log("TX:", tx);
    console.log("trackerBase cost:", trackerBase.cost.toNumber());

    const index = trackerBase.index.toNumber() + 1
    let [tokenTrackerAddress, tokenTrackerBump] = anchor.web3.PublicKey.findProgramAddressSync(
        [tokenTrackerBaseAddress.toBuffer(), Buffer.from(index.toString())],
        program.programId
    );
    //bonding address
    let [tokenStateAddress, tokenStateBump] = anchor.web3.PublicKey.findProgramAddressSync(
        [tokenTrackerBaseAddress.toBuffer(), Buffer.from(ID)],
        program.programId
    );

    let [baseTokenAddress, baseTokenBump] = anchor.web3.PublicKey.findProgramAddressSync(
        [tokenStateAddress.toBuffer(), Buffer.from("base_token")],
        program.programId
    );
    //token address for DAO wallet (receives WSOL)
    daoReserveTokenAddress = getAssociatedTokenAddressSync(quoteMint, daoReserveWallet.publicKey)
    try {
        let daoTokenAccount = await getAccount(provider.connection, daoReserveTokenAddress)
        daoReserveTokenAddress = daoTokenAccount.address
    } catch (error) {
        console.log("creating dao reserve token account")
        let daoTokenAccountRes = await createAssociatedTokenAccount(
            provider.connection,
            (provider.wallet as NodeWallet).payer,
            quoteMint,
            daoReserveWallet.publicKey);
        await new Promise(r => setTimeout(r, 3000));
        console.log("Dao reserve wallet account created -", daoTokenAccountRes.toBase58())
        daoReserveTokenAddress = daoTokenAccountRes
    }

    daoSurplusTokenAddress = getAssociatedTokenAddressSync(quoteMint, daoSurplusWallet.publicKey)
    try {
        let daoTokenAccount = await getAccount(provider.connection, daoSurplusTokenAddress)
        daoReserveTokenAddress = daoTokenAccount.address
    } catch (error) {
        console.log("creating dao surplus token account")
        let daoTokenAccountRes = await createAssociatedTokenAccount(
            provider.connection,
            (provider.wallet as NodeWallet).payer,
            quoteMint,
            daoSurplusWallet.publicKey);
        await new Promise(r => setTimeout(r, 3000));
        console.log("Dao surplus wallet account created -", daoTokenAccountRes.toBase58())
        daoSurplusTokenAddress = daoTokenAccountRes
    }

    daoRunwayTokenAddress = getAssociatedTokenAddressSync(quoteMint, daoRunwayWallet.publicKey)
    try {
        let daoTokenAccount = await getAccount(provider.connection, daoRunwayTokenAddress)
        daoReserveTokenAddress = daoTokenAccount.address
    } catch (error) {
        console.log("creating dao runway token account")
        let daoTokenAccountRes = await createAssociatedTokenAccount(
            provider.connection,
            (provider.wallet as NodeWallet).payer,
            quoteMint,
            daoRunwayWallet.publicKey);
        await new Promise(r => setTimeout(r, 3000));
        console.log("Dao reserve runway account created -", daoTokenAccountRes.toBase58())
        daoRunwayTokenAddress = daoTokenAccountRes
    }

    //params
    //launch date
    const launchDate = Date.parse("24 Oct 2021 15:00:00 GMT") / 1000;
    const nextHalving = new anchor.BN(16_000_000_00).mul(new anchor.BN(LAMPORTS_PER_SOL))

    const emissionRate = new anchor.BN(1000).mul(new anchor.BN(LAMPORTS_PER_SOL))
    const bondingCost = 0.01 * LAMPORTS_PER_SOL
    const initialReserve = new anchor.BN(320000000).mul(new anchor.BN(LAMPORTS_PER_SOL))
    const runwayFee = (10 / 100) * 100000;
    const periodEnabled = [true, true, true, false, false, false, false, false, false, false]
    const periodMultipliers: number[] = [
        10000,
        10330,
        10880,
        0,
        0,
        0,
        0,
        0,
        0,
        0]
    //TODO - shorten bonding dates for testing, 1sec, 1min, 2min?
    const periodLengths: anchor.BN[] = [
        new anchor.BN(1),
        new anchor.BN(1 * 7),
        new anchor.BN(1 * 14),
        new anchor.BN(0),
        new anchor.BN(0),
        new anchor.BN(0),
        new anchor.BN(0),
        new anchor.BN(0),
        new anchor.BN(0),
        new anchor.BN(0)]
    const updatesAllowed = true
    const votingEnabled = Date.parse("25 Oct 2024 15:00:00 GMT") / 1000

    let txCreate = await program.methods.createBondingToken(ID, {
        nextHalving: nextHalving,
        emissionRate: emissionRate,
        bondingCost: new anchor.BN(bondingCost),
        initialReserve: initialReserve,
        periodLengths: periodLengths,
        periodMultipliers: periodMultipliers,
        periodEnabled: periodEnabled,
        updatesAllowed: updatesAllowed,
        votingEnabledDate: new anchor.BN(votingEnabled),
        launchDate: new anchor.BN(launchDate),
        runwayFee: runwayFee
    })
        .accounts({
            creator: provider.wallet.publicKey,
            tokenTrackerBase: tokenTrackerBaseAddress,
            tokenTracker: tokenTrackerAddress,
            tokenState: tokenStateAddress,
            baseMint: baseMint,
            baseTokenVault: baseTokenAddress,
            quoteMint: quoteMint,
            quoteReserveTokenAddress: daoReserveTokenAddress,
            quoteSurplusTokenAddress: daoSurplusTokenAddress,
            quoteRunwayTokenAddress: daoRunwayTokenAddress,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: anchor.web3.SystemProgram.programId,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        }).rpc()
    let tokenState = await program.account.tokenState.fetch(tokenStateAddress)
    console.log("Your transaction signature", txCreate);

    //make three vote accounts - vote options can only be created by the creator of the bonding token
    //TODO - draw accounts from a JSON file and create all of them
    let voteAccount1Id = "0|DAPE"
    let [bondVoteAddress1, bondVoteBump1] = anchor.web3.PublicKey.findProgramAddressSync(
        [tokenStateAddress.toBuffer(), Buffer.from(voteAccount1Id)],
        program.programId
    );

    let txV1 = await program.methods.createVoteAccount(voteAccount1Id).accounts({
        creator: provider.wallet.publicKey,
        tokenTrackerBase: tokenTrackerBaseAddress,
        tokenState: tokenStateAddress,
        bondVote: bondVoteAddress1,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    }).rpc()
    console.log("Your transaction signature for vote acc 1", txV1);
    const voteAccount1 = await program.account.bondVote.fetch(bondVoteAddress1)



    let voteAccount2Id = "0|GECKO"
    let [bondVoteAddress2, bondVoteBump2] = anchor.web3.PublicKey.findProgramAddressSync(
        [tokenStateAddress.toBuffer(), Buffer.from(voteAccount2Id)],
        program.programId
    );

    let txV2 = await program.methods.createVoteAccount(voteAccount2Id).accounts({
        creator: provider.wallet.publicKey,
        tokenTrackerBase: tokenTrackerBaseAddress,
        tokenState: tokenStateAddress,
        bondVote: bondVoteAddress2,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    }).rpc()
    console.log("Your transaction signature for vote acc 2", txV2);
    const voteAccount2 = await program.account.bondVote.fetch(bondVoteAddress2)



    let voteAccount3Id = "0|MONKE"
    let [bondVoteAddress3, bondVoteBump3] = anchor.web3.PublicKey.findProgramAddressSync(
        [tokenStateAddress.toBuffer(), Buffer.from(voteAccount3Id)],
        program.programId
    );

    let txV3 = await program.methods.createVoteAccount(voteAccount3Id).accounts({
        creator: provider.wallet.publicKey,
        tokenTrackerBase: tokenTrackerBaseAddress,
        tokenState: tokenStateAddress,
        bondVote: bondVoteAddress3,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    }).rpc()
    console.log("Your transaction signature for vote acc 3", txV3);

    console.log("PRE")

    let amount = new anchor.BN(1280000000).mul(new anchor.BN(LAMPORTS_PER_SOL))
    console.log("PRO", amount.toString())

    let txtopup = await program.methods.bondingVaultTopup(amount).accounts({
        user: provider.wallet.publicKey,
        tokenTrackerBase: tokenTrackerBaseAddress,
        tokenState: tokenStateAddress,
        baseTokenVault: baseTokenAddress,
        userBaseToken: baseMintTokenAddr,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
    }).rpc()
    console.log("Your transaction signature", txtopup);
    await new Promise(r => setTimeout(r, 1000));

    tokenState = await program.account.tokenState.fetch(tokenStateAddress)

    console.log("Token state total topup", tokenState.totalTopup.toString())
}

initialize()
async function getSolanaKeypair(walletName: string): Promise<any> {
    try {
        // try to read the keypair file
        const data = fs.readFileSync(`${walletName}.json`, 'utf8');
        console.log(`${walletName}.json found`)
        const dataJson = JSON.parse(data);
        let kp = Keypair.fromSecretKey(bs58.decode(dataJson.secretKey));
        return kp
    } catch (err) {
        // if the file doesn't exist, create a new keypair
        console.log(`${walletName}.json not found, generating`);
        const keypair = Keypair.generate();
        var b58 = bs58.encode(keypair.secretKey)
        fs.writeFileSync(`${walletName}.json`, JSON.stringify({ secretKey: b58 }), 'utf8');
        return keypair;
    }
}