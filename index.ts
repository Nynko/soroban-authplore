import { Account, Horizon, Keypair, Networks, Operation, SorobanRpc, TransactionBuilder, authorizeEntry, nativeToScVal, scValToNative } from "@stellar/stellar-sdk";
import { $ } from "bun";

if (
    !Bun.env.CONTRACT_ID
    || !Bun.env.SECRET
) throw new Error('Missing .env.local file. Run `bun run deploy.ts` to create it.')

const horizonUrl = 'http://localhost:8000'
const rpcUrl = `${horizonUrl}/soroban/rpc`
const horizon = new Horizon.Server(horizonUrl, { allowHttp: true })
const rpc = new SorobanRpc.Server(rpcUrl, { allowHttp: true })

const keypair = Keypair.fromSecret(Bun.env.SECRET)
const pubkey = keypair.publicKey()

const contractId = Bun.env.CONTRACT_ID
const networkPassphrase = Networks.STANDALONE

const source = await rpc
    .getAccount(pubkey)
    .then((account) => new Account(account.accountId(), account.sequenceNumber()))
    .catch(() => { throw new Error(`Issue with ${pubkey} account. Ensure you're running the \`./docker.sh\` network and have run \`bun run deploy.ts\` recently.`) })

const signer = Keypair.random()
const signerPubkey = signer.publicKey()

await horizon.friendbot(signerPubkey).call()

const simTx = new TransactionBuilder(source, {
    fee: '0',
    networkPassphrase
})
    .addOperation(Operation.invokeContractFunction({
        contract: contractId,
        function: 'run',
        args: [
            // nativeToScVal(pubkey, { type: 'address' })
            nativeToScVal(signerPubkey, { type: 'address' })
        ]
    }))
    .setTimeout(0)
    .build()

let tx
let authTx
let simRes = await rpc.simulateTransaction(simTx)

if (SorobanRpc.Api.isSimulationSuccess(simRes))
    authTx = SorobanRpc.assembleTransaction(simTx, simRes).build()
else {
    console.log(await rpc._simulateTransaction(simTx));
    throw new Error('Failed to simulate')
}

const { sequence } = await rpc.getLatestLedger()

for (const op of authTx.operations) {
    const auths = (op as Operation.InvokeHostFunction).auth

    if (!auths?.length)
        continue;

    for (let i = 0; i < auths.length; i++) {
        auths[i] = await authorizeEntry(
            auths[i],
            signer,
            sequence + 12,
            networkPassphrase
        )
    }
}

simRes = await rpc.simulateTransaction(authTx)

if (SorobanRpc.Api.isSimulationSuccess(simRes))
    tx = SorobanRpc.assembleTransaction(authTx, simRes).build()
else {
    console.log(await rpc._simulateTransaction(authTx));
    throw new Error('Failed to resimulate')
}

tx.sign(keypair)

const sendRes = await rpc.sendTransaction(tx)

if (sendRes.status === 'PENDING') {
    await Bun.sleep(5000);
    const getRes = await rpc.getTransaction(sendRes.hash)

    if (getRes.status !== 'NOT_FOUND') {
        console.log(
            getRes.status,
            scValToNative(simRes.result!.retval)
        )

        const resultMeta = await $`echo ${getRes.resultMetaXdr.toXDR('base64')} | soroban lab xdr dec --type TransactionMeta --output json`.json()

        resultMeta?.v3?.soroban_meta?.diagnostic_events?.forEach(({ event }: any) => console.log(event?.body?.v0))
    } else console.log(await rpc._getTransaction(sendRes.hash))
} else console.log(await rpc._sendTransaction(tx))