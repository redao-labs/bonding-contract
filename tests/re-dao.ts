import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ReDao } from "../target/types/re_dao";
import * as crypto from 'crypto';
import {
  TOKEN_PROGRAM_ID,
  createMint,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccount,
  createAccount,
  getAccount,
  mintTo
} from '@solana/spl-token'
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import * as assert from 'assert'
import { Keypair, LAMPORTS_PER_SOL, Transaction, SystemProgram, sendAndConfirmTransaction } from "@solana/web3.js"
import { publicKey, token } from "@coral-xyz/anchor/dist/cjs/utils";



describe("re-dao", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.ReDao as Program<ReDao>;

  const daoReserveWallet = Keypair.generate()
  let daoReserveTokenAddress = null;
  const daoSurplusWallet = Keypair.generate()
  let daoSurplusTokenAddress = null;
  const daoRunwayWallet = Keypair.generate()
  let daoRunwayTokenAddress = null;

  const ID = crypto.randomBytes(20).toString('hex').slice(0, 6);
  const TRACKER_ID = crypto.randomBytes(20).toString('hex').slice(0, 5);

  let quoteMint = null; //WSOL
  let quoteMintTokenAddr = null;
  let baseMint = null; //RE
  let baseMintTokenAddr = null;

  it("Setup mints", async () => {

    console.log("Creating mints")

    //Quote mints
    quoteMint = await createMint(
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
    quoteMintTokenAddr = quoteMintTokenAddrRes;
    await mintTo(
      provider.connection,
      (provider.wallet as NodeWallet).payer,
      quoteMint,
      quoteMintTokenAddr,
      (provider.wallet as NodeWallet).payer,
      1_000_000 * LAMPORTS_PER_SOL
    );

    //Base mints
    baseMint = await createMint(
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
    baseMintTokenAddr = baseMintTokenAddrRes;
    await mintTo(
      provider.connection,
      (provider.wallet as NodeWallet).payer,
      baseMint,
      baseMintTokenAddr,
      (provider.wallet as NodeWallet).payer,
      2_000_000_000 * LAMPORTS_PER_SOL
    );
  });
  it("Create base tracker", async () => {
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
    assert.ok(trackerBase.cost.toNumber() == 15 * LAMPORTS_PER_SOL)

  });
  it("Create bonding token", async () => {
    let [tokenTrackerBaseAddress, tokenTrackerBaseBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from(TRACKER_ID)],
      program.programId
    );
    const trackerBase = await program.account.tokenTrackerBase.fetch(tokenTrackerBaseAddress);
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
    console.log("bing")
    const nextHalving = new anchor.BN(1_000_000_000).mul(new anchor.BN(LAMPORTS_PER_SOL))
    console.log("bong", nextHalving.toString())

    const emissionRate = new anchor.BN(1_000).mul(new anchor.BN(LAMPORTS_PER_SOL))
    const bondingCost = 0.01 * LAMPORTS_PER_SOL
    const initialReserve = new anchor.BN(200_000_000).mul(new anchor.BN(LAMPORTS_PER_SOL))
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
    const periodTreasurySplit: number[] = [
      (1 / 100) * 100000,
      (3.3 / 100) * 100000,
      (8.8 / 100) * 100000,
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

    let tx = await program.methods.createBondingToken(ID, {
      nextHalving: nextHalving,
      emissionRate: emissionRate,
      bondingCost: new anchor.BN(bondingCost),
      initialReserve: initialReserve,
      periodLengths: periodLengths,
      periodMultipliers: periodMultipliers,
      treasurySplit: periodTreasurySplit,
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
    const tokenState = await program.account.tokenState.fetch(tokenStateAddress)
    console.log("Your transaction signature", tx);
    console.log("Token state index:", tokenState.stateIndex.toNumber())
    assert.ok(tokenState.stateIndex.toNumber() == 1)
    console.log("Token state creator address:", tokenState.creatorAddress.toBase58())
    assert.ok(tokenState.creatorAddress.toBase58() == provider.publicKey.toBase58())
    console.log("Token state epoch:", tokenState.epochCount)
    assert.ok(tokenState.epochCount == 0)
    console.log("Token state current epoch emissions:", tokenState.currentEpochEmissions.toString())
    assert.ok(tokenState.currentEpochEmissions.toString() == initialReserve.toString())
    console.log("Token state total emissions:", tokenState.totalEmissions.toString())
    assert.ok(tokenState.totalEmissions.toString() == initialReserve.toString())
    console.log("Token state total quote bonded:", tokenState.quoteBonded.toNumber())
    assert.ok(tokenState.quoteBonded.toNumber() == 0)
    console.log("Token state next halving:", tokenState.nextHalving.toString())
    assert.ok(tokenState.nextHalving.toString() == nextHalving.toString())
    console.log("Token state emission rate:", tokenState.emissionRate.toNumber())
    assert.ok(tokenState.emissionRate.toString() == emissionRate.toString())
    console.log("Token state bonding cost:", tokenState.bondingCost.toNumber())
    assert.ok(tokenState.bondingCost.toNumber() == bondingCost)
    console.log("Token state initial reserve:", tokenState.initialReserve.toString())
    assert.ok(tokenState.initialReserve.toString() == initialReserve.toString())
    console.log("Token state launch date:", tokenState.launchDate.toNumber())
    assert.ok(tokenState.launchDate.toNumber() == launchDate)
    console.log("Token state period enabled:", tokenState.periodEnabled)
    const expectedPeriodsArray = periodEnabled//[true, true, true, false, false, false, false, false, false, false];
    assert.ok(
      Array.isArray(tokenState.periodEnabled) &&
      tokenState.periodEnabled.length === expectedPeriodsArray.length &&
      tokenState.periodEnabled.every((value, index) => value === expectedPeriodsArray[index]),
      "Token state period enabled array does not match expected values"
    );
    console.log("Token state period multipliers:", tokenState.periodMultipliers)
    const expectedPeriodMultipliersArray = periodMultipliers//[10000, 10330, 10880, 0, 0, 0, 0, 0, 0, 0];
    assert.ok(
      Array.isArray(tokenState.periodMultipliers) &&
      tokenState.periodMultipliers.length === expectedPeriodMultipliersArray.length &&
      tokenState.periodMultipliers.every((value, index) => value === expectedPeriodMultipliersArray[index]),
      "Token state period multipliers array does not match expected values"
    );
    console.log("Token state treasury splits:", tokenState.periodMultipliers)
    const expectedSplitArray = periodTreasurySplit//[10000, 10330, 10880, 0, 0, 0, 0, 0, 0, 0];
    assert.ok(
      Array.isArray(tokenState.treasurySplit) &&
      tokenState.treasurySplit.length === expectedSplitArray.length &&
      tokenState.treasurySplit.every((value, index) => value === expectedSplitArray[index]),
      "Token state period treasury split array does not match expected values"
    );
    console.log("Token state period lengths:", tokenState.periodLengths.map((bn) => bn.toNumber()));
    const expectedPeriodLengthsArray = periodLengths//[86400, 604800, 1209600, 0, 0, 0, 0, 0, 0, 0];
    assert.ok(
      Array.isArray(tokenState.periodLengths) &&
      tokenState.periodLengths.length === expectedPeriodLengthsArray.length &&
      tokenState.periodMultipliers.every((value, index) => value === expectedPeriodMultipliersArray[index]),
      "Token state period lengths array does not match expected values"
    );
    console.log("Token state updates allowed:", tokenState.updatesAllowed)
    assert.ok(tokenState.updatesAllowed == updatesAllowed)
    console.log("Token voting enabled:", tokenState.votingEnabledDate.toNumber())
    assert.ok(tokenState.votingEnabledDate.toNumber() == votingEnabled)
    console.log("Token total topup:", tokenState.totalTopup.toString())
    assert.ok(tokenState.totalTopup.toString() == "0")
    console.log("Token mps:", tokenState.mps.toString())
    assert.ok(tokenState.mps.toString() == initialReserve.toString())
    console.log("Token floor price", tokenState.floorPrice.toNumber())
    assert.ok(tokenState.floorPrice.toNumber() == 0)
    console.log("Token avg price", tokenState.avgPrice.toNumber())

  });
  it("Create vote accounts", async () => {
    let [tokenTrackerBaseAddress, tokenTrackerBaseBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from(TRACKER_ID)],
      program.programId
    );
    let [tokenStateAddress, tokenStateBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [tokenTrackerBaseAddress.toBuffer(), Buffer.from(ID)],
      program.programId
    );
    //make three vote accounts - vote options can only be created by the creator of the bonding token
    //TODO - draw accounts from a JSON file and create all of them
    let voteAccount1Id = "0|DAPE"
    let [bondVoteAddress1, bondVoteBump1] = anchor.web3.PublicKey.findProgramAddressSync(
      [tokenStateAddress.toBuffer(), Buffer.from(voteAccount1Id)],
      program.programId
    );

    let tx = await program.methods.createVoteAccount(voteAccount1Id).accounts({
      creator: provider.wallet.publicKey,
      tokenTrackerBase: tokenTrackerBaseAddress,
      tokenState: tokenStateAddress,
      bondVote: bondVoteAddress1,
      systemProgram: anchor.web3.SystemProgram.programId,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    }).rpc()
    console.log("Your transaction signature for vote acc 1", tx);
    const voteAccount1 = await program.account.bondVote.fetch(bondVoteAddress1)
    assert.ok(String.fromCharCode(...voteAccount1.id).trim() === voteAccount1Id, "Vote account 1 id mismatch");
    assert.ok(voteAccount1.tokenStateAddress.toBase58() == tokenStateAddress.toBase58(), "Vote account 1 token state address mismatch.")
    assert.ok(voteAccount1.totalVotes.toNumber() == 0, "Vote account 1 total votes mismatch.")


    let voteAccount2Id = "0|GECKO"
    let [bondVoteAddress2, bondVoteBump2] = anchor.web3.PublicKey.findProgramAddressSync(
      [tokenStateAddress.toBuffer(), Buffer.from(voteAccount2Id)],
      program.programId
    );

    let tx1 = await program.methods.createVoteAccount(voteAccount2Id).accounts({
      creator: provider.wallet.publicKey,
      tokenTrackerBase: tokenTrackerBaseAddress,
      tokenState: tokenStateAddress,
      bondVote: bondVoteAddress2,
      systemProgram: anchor.web3.SystemProgram.programId,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    }).rpc()
    console.log("Your transaction signature for vote acc 2", tx1);
    const voteAccount2 = await program.account.bondVote.fetch(bondVoteAddress2)
    assert.ok(String.fromCharCode(...voteAccount1.id).trim() === voteAccount1Id, "Vote account 2 id mismatch");
    assert.ok(voteAccount2.tokenStateAddress.toBase58() == tokenStateAddress.toBase58(), "Vote account 2 token state address mismatch.")
    assert.ok(voteAccount2.totalVotes.toNumber() == 0, "Vote account 1 total votes mismatch.")


    let voteAccount3Id = "0|MONKE"
    let [bondVoteAddress3, bondVoteBump3] = anchor.web3.PublicKey.findProgramAddressSync(
      [tokenStateAddress.toBuffer(), Buffer.from(voteAccount3Id)],
      program.programId
    );

    let tx2 = await program.methods.createVoteAccount(voteAccount3Id).accounts({
      creator: provider.wallet.publicKey,
      tokenTrackerBase: tokenTrackerBaseAddress,
      tokenState: tokenStateAddress,
      bondVote: bondVoteAddress3,
      systemProgram: anchor.web3.SystemProgram.programId,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    }).rpc()
    console.log("Your transaction signature for vote acc 3", tx2);
    const voteAccount3 = await program.account.bondVote.fetch(bondVoteAddress3)
    assert.ok(String.fromCharCode(...voteAccount3.id).trim() === voteAccount3Id, "Vote account 3 id mismatch");
    assert.ok(voteAccount3.tokenStateAddress.toBase58() == tokenStateAddress.toBase58(), "Vote account 3 token state address mismatch.")
    assert.ok(voteAccount3.totalVotes.toNumber() == 0, "Vote account 3 total votes mismatch.")
  })
  it("Bonding vault topup", async () => {
    let [tokenTrackerBaseAddress, tokenTrackerBaseBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from(TRACKER_ID)],
      program.programId
    );
    let [tokenStateAddress, tokenStateBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [tokenTrackerBaseAddress.toBuffer(), Buffer.from(ID)],
      program.programId
    );

    let [baseTokenAddress, baseTokenBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [tokenStateAddress.toBuffer(), Buffer.from("base_token")],
      program.programId
    );
    console.log("PRE")

    let amount = new anchor.BN(1_800_000_000).mul(new anchor.BN(LAMPORTS_PER_SOL))
    console.log("PRO", amount.toString())

    let tx = await program.methods.bondingVaultTopup(amount).accounts({
      user: provider.wallet.publicKey,
      tokenTrackerBase: tokenTrackerBaseAddress,
      tokenState: tokenStateAddress,
      baseTokenVault: baseTokenAddress,
      userBaseToken: baseMintTokenAddr,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
    }).rpc()
    console.log("Your transaction signature", tx);
    await new Promise(r => setTimeout(r, 1000));

    const tokenState = await program.account.tokenState.fetch(tokenStateAddress)

    console.log("Token state total topup", tokenState.totalTopup.toString())
    assert.ok(tokenState.totalTopup.toString() == amount.toString())
  });
  it("Bond period 0", async () => {
    let [tokenTrackerBaseAddress, tokenTrackerBaseBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from(TRACKER_ID)],
      program.programId
    );
    let [tokenStateAddress, tokenStateBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [tokenTrackerBaseAddress.toBuffer(), Buffer.from(ID)],
      program.programId
    );
    const bondingAmount = 0.01 * LAMPORTS_PER_SOL
    const periodIndex = 0;
    const couponId = crypto.randomBytes(20).toString('hex').slice(0, 10);
    console.log(couponId)
    let [couponAddress, couponBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [tokenStateAddress.toBuffer(), provider.wallet.publicKey.toBuffer(), Buffer.from(couponId)],
      program.programId
    );
    let voteAccount1Id = "0|DAPE"
    let [bondVoteAddress1, bondVoteBump1] = anchor.web3.PublicKey.findProgramAddressSync(
      [tokenStateAddress.toBuffer(), Buffer.from(voteAccount1Id)],
      program.programId
    );
    let voteAccount2Id = "0|GECKO"
    let [bondVoteAddress2, bondVoteBump2] = anchor.web3.PublicKey.findProgramAddressSync(
      [tokenStateAddress.toBuffer(), Buffer.from(voteAccount2Id)],
      program.programId
    );
    let voteAccount3Id = "0|MONKE"
    let [bondVoteAddress3, bondVoteBump3] = anchor.web3.PublicKey.findProgramAddressSync(
      [tokenStateAddress.toBuffer(), Buffer.from(voteAccount3Id)],
      program.programId
    );
    let tx = await program.methods.bond(couponId, new anchor.BN(bondingAmount), periodIndex).accounts({
      user: provider.wallet.publicKey,
      tokenTrackerBase: tokenTrackerBaseAddress,
      tokenState: tokenStateAddress,
      userQuoteToken: quoteMintTokenAddr,
      quoteRunwayTokenAddress: daoRunwayTokenAddress,
      quoteReserveTokenAddress: daoReserveTokenAddress,
      quoteSurplusTokenAddress: daoSurplusTokenAddress,
      coupon: couponAddress,
      bondVote: bondVoteAddress1,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
    }).rpc({ skipPreflight: true })
    console.log("Your transaction signature", tx);
    await new Promise(r => setTimeout(r, 1000));

    const tokenState = await program.account.tokenState.fetch(tokenStateAddress)
    //console.log(tokenState) 
    console.log("Total emissions: ", tokenState.totalEmissions.toString())
    assert.ok(tokenState.totalEmissions.toString() == "200001000000000000")
    console.log("Mps: ", tokenState.mps.toString())
    assert.ok(tokenState.mps.toString() == "200001088000000000")
    console.log("Quote bonded: ", tokenState.quoteBonded.toNumber())
    assert.ok(tokenState.quoteBonded.toNumber() == 9000000)
    //quote bonded - (quote bonded * treasury split) -> 9000000 - (9000000 * 0.01) = 8910000
    console.log("Reserve: ", tokenState.totalReserve.toNumber())
    assert.ok(tokenState.totalReserve.toNumber() == 8910000)
    //quote bonded * treasury split -> (9000000 * 0.01) =  90000
    console.log("Surplus: ", tokenState.totalSurplusReserve.toNumber())
    assert.ok(tokenState.totalSurplusReserve.toNumber() == 90000)
    console.log("Runway Reserve: ", tokenState.totalRunwayReserve.toNumber())
    assert.ok(tokenState.totalRunwayReserve.toNumber() == 1000000)
    //todo floor is not being used here, update
    console.log("Floor price", tokenState.floorPrice.toNumber())
    assert.ok(tokenState.floorPrice.toNumber() == 0)
    await new Promise(r => setTimeout(r, 1000));
    let reserve = await getAccount(
      provider.connection,
      daoReserveTokenAddress
    )
    let surplus = await getAccount(
      provider.connection,
      daoSurplusTokenAddress
    )
    let runway = await getAccount(
      provider.connection,
      daoRunwayTokenAddress
    )
    console.log("Dao reserve address", daoReserveTokenAddress.toBase58())
    console.log("Dao reserve amount", reserve.amount.toString())
    assert.ok(reserve.amount.toString() == (8910000).toString())
    console.log("Dao surplus token address", daoSurplusTokenAddress.toBase58())
    console.log("Dao surplus amount", surplus.amount.toString())
    assert.ok(surplus.amount.toString() == (90000).toString())
    console.log("Dao quote runway surplus", daoRunwayTokenAddress.toBase58())
    console.log("Dao runway amount", runway.amount.toString())
    assert.ok(runway.amount.toString() == (1000000).toString())

    //vote
    const voteAccount1 = await program.account.bondVote.fetch(bondVoteAddress1)
    assert.ok(String.fromCharCode(...voteAccount1.id).trim() === voteAccount1Id, "Vote account 1 id mismatch");
    assert.ok(voteAccount1.tokenStateAddress.toBase58() == tokenStateAddress.toBase58(), "Vote account 1 token state address mismatch.")
    console.log("Vote account 1 votes", voteAccount1.totalVotes.toNumber())
    assert.ok(voteAccount1.totalVotes.toNumber() == bondingAmount, "Vote account 1 total votes mismatch.")

    const voteAccount2 = await program.account.bondVote.fetch(bondVoteAddress2)
    assert.ok(String.fromCharCode(...voteAccount2.id).trim() === voteAccount2Id, "Vote account 2 id mismatch");
    assert.ok(voteAccount2.tokenStateAddress.toBase58() == tokenStateAddress.toBase58(), "Vote account 2 token state address mismatch.")
    console.log("Vote account 2 votes", voteAccount2.totalVotes.toNumber())
    assert.ok(voteAccount2.totalVotes.toNumber() == 0, "Vote account 2 total votes mismatch.")

    const voteAccount3 = await program.account.bondVote.fetch(bondVoteAddress3)
    assert.ok(String.fromCharCode(...voteAccount3.id).trim() === voteAccount3Id, "Vote account 3 id mismatch");
    assert.ok(voteAccount3.tokenStateAddress.toBase58() == tokenStateAddress.toBase58(), "Vote account 3 token state address mismatch.")
    console.log("Vote account 3 votes", voteAccount3.totalVotes.toNumber())
    assert.ok(voteAccount3.totalVotes.toNumber() == 0, "Vote account 3 total votes mismatch.")
  });
  it("Bond period 1", async () => {
    let [tokenTrackerBaseAddress, tokenTrackerBaseBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from(TRACKER_ID)],
      program.programId
    );
    let [tokenStateAddress, tokenStateBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [tokenTrackerBaseAddress.toBuffer(), Buffer.from(ID)],
      program.programId
    );
    let [baseTokenAddress, baseTokenBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [tokenStateAddress.toBuffer(), Buffer.from("base_token")],
      program.programId
    );
    const bondingAmount = 0.01 * LAMPORTS_PER_SOL
    const periodIndex = 1;
    console.log("zoink")
    const couponId = crypto.randomBytes(20).toString('hex').slice(0, 10);
    console.log(couponId)
    let [couponAddress, couponBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [tokenStateAddress.toBuffer(), provider.wallet.publicKey.toBuffer(), Buffer.from(couponId)],
      program.programId
    );
    let voteAccount1Id = "0|DAPE"
    let [bondVoteAddress1, bondVoteBump1] = anchor.web3.PublicKey.findProgramAddressSync(
      [tokenStateAddress.toBuffer(), Buffer.from(voteAccount1Id)],
      program.programId
    );
    let voteAccount2Id = "0|GECKO"
    let [bondVoteAddress2, bondVoteBump2] = anchor.web3.PublicKey.findProgramAddressSync(
      [tokenStateAddress.toBuffer(), Buffer.from(voteAccount2Id)],
      program.programId
    );
    let voteAccount3Id = "0|MONKE"
    let [bondVoteAddress3, bondVoteBump3] = anchor.web3.PublicKey.findProgramAddressSync(
      [tokenStateAddress.toBuffer(), Buffer.from(voteAccount3Id)],
      program.programId
    );
    let tx = await program.methods.bond(couponId, new anchor.BN(bondingAmount), periodIndex).accounts({
      user: provider.wallet.publicKey,
      tokenTrackerBase: tokenTrackerBaseAddress,
      tokenState: tokenStateAddress,
      userQuoteToken: quoteMintTokenAddr,
      quoteRunwayTokenAddress: daoRunwayTokenAddress,
      quoteReserveTokenAddress: daoReserveTokenAddress,
      quoteSurplusTokenAddress: daoSurplusTokenAddress,
      coupon: couponAddress,
      bondVote: bondVoteAddress1,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
    }).rpc({ skipPreflight: true })
    console.log("Your transaction signature", tx);
    await new Promise(r => setTimeout(r, 1000));

    const tokenState = await program.account.tokenState.fetch(tokenStateAddress)
    //console.log(tokenState) 
    console.log("Total emissions: ", tokenState.totalEmissions.toString())
    assert.ok(tokenState.totalEmissions.toString() == "200002033000000000")
    console.log("Mps: ", tokenState.mps.toString())
    assert.ok(tokenState.mps.toString() == "200002176000000000")
    console.log("Quote bonded: ", tokenState.quoteBonded.toNumber())
    assert.ok(tokenState.quoteBonded.toNumber() == 18000000)
    //8910000 + quote bonded - (quote bonded * treasury split) -> 9000000 - (9000000 * 0.033) = 8910000 + 8703000 = 17613000
    console.log("Reserve: ", tokenState.totalReserve.toNumber())
    assert.ok(tokenState.totalReserve.toNumber() == 17613000)
    //90000 + quote bonded * treasury split -> (9000000 * 0.033) = 90000 + 297000 = 387000
    console.log("Surplus: ", tokenState.totalSurplusReserve.toNumber())
    assert.ok(tokenState.totalSurplusReserve.toNumber() == 387000)
    console.log("Runway Reserve: ", tokenState.totalRunwayReserve.toNumber())
    assert.ok(tokenState.totalRunwayReserve.toNumber() == 2000000)
    console.log("Floor price", tokenState.floorPrice.toNumber())
    assert.ok(tokenState.floorPrice.toNumber() == 0)
    await new Promise(r => setTimeout(r, 1000));
    let reserve = await getAccount(
      provider.connection,
      daoReserveTokenAddress
    )
    let surplus = await getAccount(
      provider.connection,
      daoSurplusTokenAddress
    )
    let runway = await getAccount(
      provider.connection,
      daoRunwayTokenAddress
    )
    console.log("Dao reserve address", daoReserveTokenAddress.toBase58())
    console.log("Dao reserve amount", reserve.amount.toString())
    assert.ok(reserve.amount.toString() == (17613000).toString())
    console.log("Dao surplus token address", daoSurplusTokenAddress.toBase58())
    console.log("Dao surplus amount", surplus.amount.toString())
    assert.ok(surplus.amount.toString() == (387000).toString())
    console.log("Dao quote runway surplus", daoRunwayTokenAddress.toBase58())
    console.log("Dao runway amount", runway.amount.toString())
    assert.ok(runway.amount.toString() == (2000000).toString())

    //vote
    const voteAccount1 = await program.account.bondVote.fetch(bondVoteAddress1)
    assert.ok(String.fromCharCode(...voteAccount1.id).trim() === voteAccount1Id, "Vote account 1 id mismatch");
    assert.ok(voteAccount1.tokenStateAddress.toBase58() == tokenStateAddress.toBase58(), "Vote account 1 token state address mismatch.")
    console.log("Vote account 1 votes", voteAccount1.totalVotes.toNumber())
    assert.ok(voteAccount1.totalVotes.toNumber() == bondingAmount * 2, "Vote account 1 total votes mismatch.")

    const voteAccount2 = await program.account.bondVote.fetch(bondVoteAddress2)
    assert.ok(String.fromCharCode(...voteAccount2.id).trim() === voteAccount2Id, "Vote account 2 id mismatch");
    assert.ok(voteAccount2.tokenStateAddress.toBase58() == tokenStateAddress.toBase58(), "Vote account 2 token state address mismatch.")
    console.log("Vote account 2 votes", voteAccount2.totalVotes.toNumber())
    assert.ok(voteAccount2.totalVotes.toNumber() == 0, "Vote account 2 total votes mismatch.")

    const voteAccount3 = await program.account.bondVote.fetch(bondVoteAddress3)
    assert.ok(String.fromCharCode(...voteAccount3.id).trim() === voteAccount3Id, "Vote account 3 id mismatch");
    assert.ok(voteAccount3.tokenStateAddress.toBase58() == tokenStateAddress.toBase58(), "Vote account 3 token state address mismatch.")
    console.log("Vote account 3 votes", voteAccount3.totalVotes.toNumber())
    assert.ok(voteAccount3.totalVotes.toNumber() == 0, "Vote account 3 total votes mismatch.")
  });
  it("Bond period 2", async () => { 
    let [tokenTrackerBaseAddress, tokenTrackerBaseBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from(TRACKER_ID)],
      program.programId
    );
    let [tokenStateAddress, tokenStateBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [tokenTrackerBaseAddress.toBuffer(), Buffer.from(ID)],
      program.programId
    );
    let [baseTokenAddress, baseTokenBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [tokenStateAddress.toBuffer(), Buffer.from("base_token")],
      program.programId
    );
    const bondingAmount = 0.01 * LAMPORTS_PER_SOL
    const periodIndex = 2;
    const couponId = crypto.randomBytes(20).toString('hex').slice(0, 10);
    console.log(couponId)
    let [couponAddress, couponBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [tokenStateAddress.toBuffer(), provider.wallet.publicKey.toBuffer(), Buffer.from(couponId)],
      program.programId
    );
    let voteAccount1Id = "0|DAPE"
    let [bondVoteAddress1, bondVoteBump1] = anchor.web3.PublicKey.findProgramAddressSync(
      [tokenStateAddress.toBuffer(), Buffer.from(voteAccount1Id)],
      program.programId
    );
    let voteAccount2Id = "0|GECKO"
    let [bondVoteAddress2, bondVoteBump2] = anchor.web3.PublicKey.findProgramAddressSync(
      [tokenStateAddress.toBuffer(), Buffer.from(voteAccount2Id)],
      program.programId
    );
    let voteAccount3Id = "0|MONKE"
    let [bondVoteAddress3, bondVoteBump3] = anchor.web3.PublicKey.findProgramAddressSync(
      [tokenStateAddress.toBuffer(), Buffer.from(voteAccount3Id)],
      program.programId
    );
    let tx = await program.methods.bond(couponId, new anchor.BN(bondingAmount), periodIndex).accounts({
      user: provider.wallet.publicKey,
      tokenTrackerBase: tokenTrackerBaseAddress,
      tokenState: tokenStateAddress,

      userQuoteToken: quoteMintTokenAddr,
      quoteRunwayTokenAddress: daoRunwayTokenAddress,
      quoteReserveTokenAddress: daoReserveTokenAddress,
      quoteSurplusTokenAddress: daoSurplusTokenAddress,
      coupon: couponAddress,
      bondVote: null,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
    }).rpc({skipPreflight: true})
    console.log("Your transaction signature", tx);
    await new Promise(r => setTimeout(r, 1000));

    const tokenState = await program.account.tokenState.fetch(tokenStateAddress)
    //console.log(tokenState) 
    console.log("Epoch: ", tokenState.epochCount.toString())
    console.log("Total emissions: ", tokenState.totalEmissions.toString())
    assert.ok(tokenState.totalEmissions.toString() == "200003121000000000")
    console.log("Mps: ", tokenState.mps.toString())
    assert.ok(tokenState.mps.toString() == "200003264000000000")
    console.log("Quote bonded: ", tokenState.quoteBonded.toNumber())
    assert.ok(tokenState.quoteBonded.toNumber() == 27000000)
    //17613000 + quote bonded - (quote bonded * treasury split) -> 9000000 - (9000000 * 0.088) = 17613000 + 8208000 = 25821000
    console.log("Reserve: ", tokenState.totalReserve.toNumber())
    assert.ok(tokenState.totalReserve.toNumber() == 25821000)
    // 387000 + quote bonded * treasury split -> (9000000 * 0.088) =  387000 + 792000 = 1179000
    console.log("Surplus: ", tokenState.totalSurplusReserve.toNumber())
    assert.ok(tokenState.totalSurplusReserve.toNumber() == 1179000)
    console.log("Runway Reserve: ", tokenState.totalRunwayReserve.toNumber())
    assert.ok(tokenState.totalRunwayReserve.toNumber() == 3000000)
    console.log("Floor price", tokenState.floorPrice.toNumber())
    assert.ok(tokenState.floorPrice.toNumber() == 0)
    await new Promise(r => setTimeout(r, 1000));
    let reserve = await getAccount(
      provider.connection,
      daoReserveTokenAddress
    )
    let surplus = await getAccount(
      provider.connection,
      daoSurplusTokenAddress
    )
    let runway = await getAccount(
      provider.connection,
      daoRunwayTokenAddress
    )
    console.log("Dao reserve address", daoReserveTokenAddress.toBase58())
    console.log("Dao reserve amount", reserve.amount.toString())
    assert.ok(reserve.amount.toString() == (25821000).toString())
    console.log("Dao surplus token address", daoSurplusTokenAddress.toBase58())
    console.log("Dao surplus amount", surplus.amount.toString())
    assert.ok(surplus.amount.toString() == (1179000).toString())
    console.log("Dao quote runway surplus", daoRunwayTokenAddress.toBase58())
    console.log("Dao runway amount", runway.amount.toString())
    assert.ok(runway.amount.toString() == (3000000).toString())

    //vote
    const voteAccount1 = await program.account.bondVote.fetch(bondVoteAddress1)
    assert.ok(String.fromCharCode(...voteAccount1.id).trim() === voteAccount1Id, "Vote account 1 id mismatch");
    assert.ok(voteAccount1.tokenStateAddress.toBase58() == tokenStateAddress.toBase58(), "Vote account 1 token state address mismatch.")
    console.log("Vote account 1 votes", voteAccount1.totalVotes.toNumber())
    assert.ok(voteAccount1.totalVotes.toNumber() == 20000000, "Vote account 1 total votes mismatch.")

    const voteAccount2 = await program.account.bondVote.fetch(bondVoteAddress2)
    assert.ok(String.fromCharCode(...voteAccount2.id).trim() === voteAccount2Id, "Vote account 2 id mismatch");
    assert.ok(voteAccount2.tokenStateAddress.toBase58() == tokenStateAddress.toBase58(), "Vote account 2 token state address mismatch.")
    console.log("Vote account 2 votes", voteAccount2.totalVotes.toNumber())
    assert.ok(voteAccount2.totalVotes.toNumber() == 0, "Vote account 2 total votes mismatch.")

    const voteAccount3 = await program.account.bondVote.fetch(bondVoteAddress3)
    assert.ok(String.fromCharCode(...voteAccount3.id).trim() === voteAccount3Id, "Vote account 3 id mismatch");
    assert.ok(voteAccount3.tokenStateAddress.toBase58() == tokenStateAddress.toBase58(), "Vote account 3 token state address mismatch.")
    console.log("Vote account 3 votes", voteAccount3.totalVotes.toNumber())
    assert.ok(voteAccount3.totalVotes.toNumber() == 0, "Vote account 3 total votes mismatch.")
  });
  it("Redeem coupons", async () => {
    //sleep
    await new Promise(r => setTimeout(r, 15000));
    let [tokenTrackerBaseAddress, tokenTrackerBaseBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from(TRACKER_ID)],
      program.programId
    );
    let [tokenStateAddress, tokenStateBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [tokenTrackerBaseAddress.toBuffer(), Buffer.from(ID)],
      program.programId
    );
    //fetch coupons
    console.log(provider.wallet.publicKey.toBase58())
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

    //console.log(coupons)
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
        userBaseToken: baseMintTokenAddr,
        baseTokenVault: baseTokenAddress,
        coupon: couponAddress,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      }).rpc()
      console.log("Claim tx", tx)
      const couponRes = await program.account.bondCoupon.fetch(couponAddress)
      console.log("Coupon claimed:", couponRes.isRedeemed)
      assert.ok(couponRes.isRedeemed == true)
    }
  });
  it("Bond loop", async () => {
    //bond at three different periods
    let count = 0;
    while (count < 100) {
      count++;
      try {
        for (let index = 0; index < 2; index++) {
          let [tokenTrackerBaseAddress, tokenTrackerBaseBump] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from(TRACKER_ID)],
            program.programId
          );
          let [tokenStateAddress, tokenStateBump] = anchor.web3.PublicKey.findProgramAddressSync(
            [tokenTrackerBaseAddress.toBuffer(), Buffer.from(ID)],
            program.programId
          );
          const bondingAmount = 0.01 * LAMPORTS_PER_SOL
          const periodIndex = index;
          const couponId = crypto.randomBytes(20).toString('hex').slice(0, 10);
          console.log(couponId)
          let [couponAddress, couponBump] = anchor.web3.PublicKey.findProgramAddressSync(
            [tokenStateAddress.toBuffer(), provider.wallet.publicKey.toBuffer(), Buffer.from(couponId)],
            program.programId
          );
          let voteAccount1Id = "0|DAPE"
          let [bondVoteAddress1, bondVoteBump1] = anchor.web3.PublicKey.findProgramAddressSync(
            [tokenStateAddress.toBuffer(), Buffer.from(voteAccount1Id)],
            program.programId
          );
          let voteAccount2Id = "0|GECKO"
          let [bondVoteAddress2, bondVoteBump2] = anchor.web3.PublicKey.findProgramAddressSync(
            [tokenStateAddress.toBuffer(), Buffer.from(voteAccount2Id)],
            program.programId
          );
          let voteAccount3Id = "0|MONKE"
          let [bondVoteAddress3, bondVoteBump3] = anchor.web3.PublicKey.findProgramAddressSync(
            [tokenStateAddress.toBuffer(), Buffer.from(voteAccount3Id)],
            program.programId
          );
          let tx = await program.methods.bond(couponId, new anchor.BN(bondingAmount), periodIndex).accounts({
            user: provider.wallet.publicKey,
            tokenTrackerBase: tokenTrackerBaseAddress,
            tokenState: tokenStateAddress,
            userQuoteToken: quoteMintTokenAddr,
            quoteRunwayTokenAddress: daoRunwayTokenAddress,
            quoteReserveTokenAddress: daoReserveTokenAddress,
            quoteSurplusTokenAddress: daoSurplusTokenAddress,
            coupon: couponAddress,
            bondVote: bondVoteAddress1,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: anchor.web3.SystemProgram.programId,
          }).rpc({skipPreflight: true})
          console.log("Your transaction signature", tx);
          await new Promise(r => setTimeout(r, 1000));

          const tokenState = await program.account.tokenState.fetch(tokenStateAddress)
          //console.log(tokenState) 
          console.log("Total emissions: ", tokenState.totalEmissions.toString())
          //assert.ok(tokenState.totalEmissions.toString() == "320001000000000000")
          console.log("Mps: ", tokenState.mps.toString())
          //assert.ok(tokenState.mps.toString() == "320001088000000000")
          console.log("Quote bonded: ", tokenState.quoteBonded.toNumber())
          //assert.ok(tokenState.quoteBonded.toNumber() == 9000000)
          console.log("Reserve: ", tokenState.totalReserve.toNumber())
          //assert.ok(tokenState.totalReserve.toNumber() == 9000000)
          console.log("Surplus: ", tokenState.totalSurplusReserve.toNumber())
          //assert.ok(tokenState.totalSurplusReserve.toNumber() == 0)
          console.log("Runway Reserve: ", tokenState.totalRunwayReserve.toNumber())
          //assert.ok(tokenState.totalRunwayReserve.toNumber() == 1000000)
          console.log("Floor price", tokenState.floorPrice.toNumber())
          //assert.ok(tokenState.floorPrice.toNumber() == 0)
          await new Promise(r => setTimeout(r, 1000));
          let reserve = await getAccount(
            provider.connection,
            daoReserveTokenAddress
          )
          let surplus = await getAccount(
            provider.connection,
            daoSurplusTokenAddress
          )
          let runway = await getAccount(
            provider.connection,
            daoRunwayTokenAddress
          )
          console.log("Dao reserve address", daoReserveTokenAddress.toBase58())
          console.log("Dao reserve amount", reserve.amount.toString())
          //assert.ok(reserve.amount.toString() == (9000000).toString())
          console.log("Dao surplus token address", daoSurplusTokenAddress.toBase58())
          console.log("Dao surplus amount", surplus.amount.toString())
          //assert.ok(surplus.amount.toString() == (0).toString())
          console.log("Dao quote runway surplus", daoRunwayTokenAddress.toBase58())
          console.log("Dao runway amount", runway.amount.toString())
          //assert.ok(runway.amount.toString() == (1000000).toString())

          //vote
          const voteAccount1 = await program.account.bondVote.fetch(bondVoteAddress1)
          //assert.ok(String.fromCharCode(...voteAccount1.id).trim() === voteAccount1Id, "Vote account 1 id mismatch");
          //assert.ok(voteAccount1.tokenStateAddress.toBase58() == tokenStateAddress.toBase58(), "Vote account 1 token state address mismatch.")
          console.log("Vote account 1 votes", voteAccount1.totalVotes.toNumber())
          //assert.ok(voteAccount1.totalVotes.toNumber() == bondingAmount, "Vote account 1 total votes mismatch.")

          const voteAccount2 = await program.account.bondVote.fetch(bondVoteAddress2)
          //assert.ok(String.fromCharCode(...voteAccount2.id).trim() === voteAccount2Id, "Vote account 2 id mismatch");
          //assert.ok(voteAccount2.tokenStateAddress.toBase58() == tokenStateAddress.toBase58(), "Vote account 2 token state address mismatch.")
          console.log("Vote account 2 votes", voteAccount2.totalVotes.toNumber())
          //assert.ok(voteAccount2.totalVotes.toNumber() == 0, "Vote account 2 total votes mismatch.")

          const voteAccount3 = await program.account.bondVote.fetch(bondVoteAddress3)
          //assert.ok(String.fromCharCode(...voteAccount3.id).trim() === voteAccount3Id, "Vote account 3 id mismatch");
          //assert.ok(voteAccount3.tokenStateAddress.toBase58() == tokenStateAddress.toBase58(), "Vote account 3 token state address mismatch.")
          console.log("Vote account 3 votes", voteAccount3.totalVotes.toNumber())
          //assert.ok(voteAccount3.totalVotes.toNumber() == 0, "Vote account 3 total votes mismatch.")
          console.log("count", count)
        }
      } catch (error) {
        console.log(error)
      }

    }
  });
});
