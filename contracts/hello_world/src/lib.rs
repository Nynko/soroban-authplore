#![no_std]
use soroban_sdk::{contract, contractimpl, vec, xdr::ToXdr, Address, Env, IntoVal};

#[contract]
pub struct Contract;

#[contractimpl]
impl Contract {
    pub fn run(env: Env, source: Address) -> bool {
        // source.require_auth();

        env.prng().seed(source.clone().to_xdr(&env).slice(..32));

        source.require_auth_for_args(vec![
            &env,
            env.prng().gen::<u64>().into_val(&env),
            0u32.into_val(&env),
            0u64.into_val(&env),
            0u128.into_val(&env),
        ]);
        true
    }
}

mod test;
