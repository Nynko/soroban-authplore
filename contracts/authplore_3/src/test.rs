#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, MockAuth, MockAuthInvoke},
    xdr::{ScErrorCode, ScErrorType},
    Address, Env, IntoVal,
};

use crate::{Contract, ContractClient};

#[test]
fn test() {
    let env = Env::default();
    let contract_id = env.register_contract(None, Contract);

    env.as_contract(&contract_id, || {
        let contract_id = env.register_contract(None, Contract);
        let client = ContractClient::new(&env, &contract_id);
        let addr = Address::generate(&env);

        let res = client
            .mock_auths(&[MockAuth {
                address: &addr,
                invoke: &MockAuthInvoke {
                    contract: &contract_id,
                    fn_name: "run",
                    args: (env.prng().gen::<u64>(), u32::MAX, u64::MAX, u128::MAX).into_val(&env),
                    sub_invokes: &[],
                },
            }])
            .run(&addr);

        assert_eq!(res, true);
    });

    let client = ContractClient::new(&env, &contract_id);
    let addr = Address::generate(&env);

    assert_eq!(
        client.try_run(&addr),
        Err(Ok(soroban_sdk::Error::from_type_and_code(
            ScErrorType::Context,
            ScErrorCode::InvalidAction
        )))
    );
}
