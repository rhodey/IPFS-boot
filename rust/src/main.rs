extern crate openssl;

use std::slice;
use std::ffi::CString;
use sha2::{Sha256, Digest};

use openssl::x509::X509;
use openssl::x509::X509StoreContext;
use openssl::x509::store::X509StoreBuilder;
use openssl::stack::Stack;

use aws_nitro_enclaves_cose::CoseSign1;
use aws_nitro_enclaves_cose::crypto::{Openssl};
use aws_nitro_enclaves_nsm_api::api::AttestationDoc;

// For test that wasm loaded ok
#[no_mangle]
pub extern "C" fn add(left: i32, right: i32) -> i32 {
    left + right
}

// Test that the cert chain which came with the attest doc is good
pub fn verify_cabundle(attestation_doc: &AttestationDoc, root_cert: X509) -> Result<bool, Box<dyn std::error::Error>> {
    // Should only hold the trusted cert, the root cert from AWS
    let mut store_builder = X509StoreBuilder::new()?;
    store_builder.add_cert(root_cert)?;
    let store = store_builder.build();

    // Build a chain of intermediate certificates in reverse order
    // This is because of the ordering that `openssl` takes and the ordering from the attestation document
    let mut cert_chain = Stack::new()?;
    for cert_bytes in attestation_doc.cabundle.iter().skip(1).rev() {
        let intermediate_cert = X509::from_der(cert_bytes)?;
        cert_chain.push(intermediate_cert)?;
    }

    // The remote enclave cert
    let remote_cert = X509::from_der(&attestation_doc.certificate)?;
    let mut store_ctx = X509StoreContext::new()?;
    let verification_result = store_ctx.init(&store, &remote_cert, &cert_chain, |ctx| {
        ctx.verify_cert()
    })?;

    Ok(verification_result)
}

// Test that the signature on the doc is good with the good cert chain
pub fn verify_signature(cose_sign: &CoseSign1, attestation_doc: &AttestationDoc) -> Result<bool, Box<dyn std::error::Error>> {
    let cert = X509::from_der(attestation_doc.certificate.as_ref())?;
    let public_key = cert.public_key()?;
    Ok(cose_sign.verify_signature::<Openssl>(&public_key).unwrap())
}

// Js calls this function and gets back an error code or 0 and a csv in out_buf
#[no_mangle]
pub extern "C" fn validate(cert: *const u8, cert_len: usize, attest_data: *const u8, attest_data_len: usize, out_buf: *mut u8, out_buf_len: usize) -> i32 {
    let cert = unsafe { slice::from_raw_parts(cert, cert_len) };
    let cert = cert.to_vec();
    let cert = X509::from_pem(&cert);
    if cert.is_err() { return 1 }
    let cert = cert.unwrap();

    let attest_data = unsafe { slice::from_raw_parts(attest_data, attest_data_len) };
    let attest_data = String::from_utf8(attest_data.to_vec().clone());
    if attest_data.is_err() { return 2 }
    let attest_data = attest_data.unwrap();

    // Expect csv from enclave
    let attest_doc_encoded;
    let user_data_encoded;
    let split = attest_data.split_once(',');

    match split {
        None => return 3,
        Some((a, b)) => {
            attest_doc_encoded = a;
            user_data_encoded = b;
        },
    }

    let attest_doc = hex::decode(attest_doc_encoded);
    if attest_doc.is_err() { return 4 }
    let attest_doc = attest_doc.unwrap();

    let cose_sign = CoseSign1::from_bytes(&attest_doc);
    if cose_sign.is_err() { return 5 }
    let cose_sign = cose_sign.unwrap();

    let payload = cose_sign.get_payload::<Openssl>(None);
    if payload.is_err() { return 6 }
    let payload = payload.unwrap();

    let doc = ciborium::de::from_reader(payload.as_slice());
    if doc.is_err() { return 7 }
    let doc = doc.unwrap();

    let valid_chain = verify_cabundle(&doc, cert);
    if valid_chain.is_err() { return 8 }
    let valid_chain = valid_chain.unwrap();
    if valid_chain == false { return 9 }

    let valid_signature = verify_signature(&cose_sign, &doc);
    if valid_signature.is_err() { return 10 }
    let valid_signature = valid_signature.unwrap();
    if valid_signature == false { return 11 }

    let mut csv = String::new();

    for &index in &[0, 1, 2] {
        if let Some(pcr_entry) = doc.pcrs.get(&index) {
            let value = format!("{},", hex::encode(pcr_entry));
            csv.push_str(&value);
        } else {
            csv.push_str(",");
        }
    }

    if let Some(public_key) = doc.public_key {
        let value = format!("{},", hex::encode(public_key));
        csv.push_str(&value);
    } else {
        csv.push_str(",");
    }

    if let Some(nonce) = doc.nonce {
        let value = format!("{},", hex::encode(nonce));
        csv.push_str(&value);
    } else {
        csv.push_str(",");
    }

    if let Some(byte_buf) = doc.user_data {
        let their_hash = hex::encode(byte_buf);

        let mut hasher = Sha256::new();
        hasher.update(user_data_encoded);
        let our_hash = hasher.finalize();
        let our_hash = format!("{:x}", our_hash);
        if our_hash != their_hash { return 12 }

        let value = format!("{},", user_data_encoded);
        csv.push_str(&value);
    } else {
        csv.push_str(",");
    }

    let csv = CString::new(csv).unwrap();
    let csv = csv.as_bytes_with_nul();
    let out_buf = unsafe { slice::from_raw_parts_mut(out_buf, out_buf_len) };

    let out_len = std::cmp::min(csv.len(), out_buf.len());
    out_buf[..out_len].copy_from_slice(&csv[..out_len]);

    return 0
}

fn main() {
    println!("");
}
