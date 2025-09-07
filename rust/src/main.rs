extern crate openssl;

use std::slice;
use std::ffi::CString;

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

// Test that the cert in the doc is authorized by the root
pub fn verify_cabundle(attestation_doc: &AttestationDoc, root_cert: X509) -> Result<bool, Box<dyn std::error::Error>> {
    // Add AWS root cert
    let mut store_builder = X509StoreBuilder::new()?;
    store_builder.add_cert(root_cert)?;
    let store = store_builder.build();

    // Build chain of intermediate certificates in reverse order
    let mut cert_chain = Stack::new()?;
    for cert_bytes in attestation_doc.cabundle.iter().skip(1).rev() {
        let intermediate_cert = X509::from_der(cert_bytes)?;
        cert_chain.push(intermediate_cert)?;
    }

    // Test that the cert in the doc is valid given the root
    let doc_cert = X509::from_der(&attestation_doc.certificate)?;
    let mut store_ctx = X509StoreContext::new()?;
    let verification_result = store_ctx.init(&store, &doc_cert, &cert_chain, |ctx| {
        ctx.verify_cert()
    })?;

    Ok(verification_result)
}

// Test that the doc was signed by the authorized cert
pub fn verify_signature(cose_sign: &CoseSign1, attestation_doc: &AttestationDoc) -> Result<bool, Box<dyn std::error::Error>> {
    let cert = X509::from_der(attestation_doc.certificate.as_ref())?;
    let public_key = cert.public_key()?;
    Ok(cose_sign.verify_signature::<Openssl>(&public_key).unwrap())
}

// Js calls this function and gets back an error code or a csv in csv_buf
#[no_mangle]
pub extern "C" fn validate(cert: *const u8, cert_len: usize, attest_doc: *const u8, attest_doc_len: usize, csv_buf: *mut u8, csv_buf_len: usize) -> i32 {
    let cert = unsafe { slice::from_raw_parts(cert, cert_len) };
    let cert = cert.to_vec();
    let cert = X509::from_pem(&cert);
    if cert.is_err() { return 1 }
    let cert = cert.unwrap();

    let attest_doc = unsafe { slice::from_raw_parts(attest_doc, attest_doc_len) };
    let attest_doc = String::from_utf8(attest_doc.to_vec().clone());
    if attest_doc.is_err() { return 2 }
    let attest_doc = attest_doc.unwrap();

    let attest_doc = base64::decode(attest_doc);
    if attest_doc.is_err() { return 3 }
    let attest_doc = attest_doc.unwrap();

    // if is test doc
    let test_doc = String::from_utf8_lossy(&attest_doc);
    if test_doc.starts_with("testdoc,") == true {
      let mut parts: Vec<&str> = test_doc.split(',').collect();
      parts.remove(0);
      parts.truncate(3);

      let mut csv = String::new();

      // public_key, nonce, user_data
      let parts = parts.join(",");
      csv.push_str(&parts);
      csv.push_str(",");

      // test doc must always have pcrs = zeros
      let pcr = "000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
      csv.push_str(&pcr);
      csv.push_str(",");
      csv.push_str(&pcr);
      csv.push_str(",");
      csv.push_str(&pcr);

      let csv = CString::new(csv).unwrap();
      let csv = csv.as_bytes_with_nul();
      let csv_buf = unsafe { slice::from_raw_parts_mut(csv_buf, csv_buf_len) };

      let out_len = std::cmp::min(csv.len(), csv_buf.len());
      csv_buf[..out_len].copy_from_slice(&csv[..out_len]);
      return 0
    }

    let cose_sign = CoseSign1::from_bytes(&attest_doc);
    if cose_sign.is_err() { return 4 }
    let cose_sign = cose_sign.unwrap();

    let payload = cose_sign.get_payload::<Openssl>(None);
    if payload.is_err() { return 5 }
    let payload = payload.unwrap();

    let doc = ciborium::de::from_reader(payload.as_slice());
    if doc.is_err() { return 6 }
    let doc = doc.unwrap();

    let valid_chain = verify_cabundle(&doc, cert);
    if valid_chain.is_err() { return 7 }
    let valid_chain = valid_chain.unwrap();
    if valid_chain != true { return 8 }

    let valid_signature = verify_signature(&cose_sign, &doc);
    if valid_signature.is_err() { return 9 }
    let valid_signature = valid_signature.unwrap();
    if valid_signature != true { return 10 }

    let mut csv = String::new();

    if let Some(public_key) = doc.public_key {
        let value = format!("{},", base64::encode(public_key));
        csv.push_str(&value);
    } else {
        csv.push_str(",");
    }

    if let Some(nonce) = doc.nonce {
        let value = format!("{},", base64::encode(nonce));
        csv.push_str(&value);
    } else {
        csv.push_str(",");
    }

    if let Some(user_data) = doc.user_data {
        let value = format!("{},", base64::encode(user_data));
        csv.push_str(&value);
    } else {
        csv.push_str(",");
    }

    for &index in &[0, 1, 2] {
        if let Some(pcr_entry) = doc.pcrs.get(&index) {
            let pcr_entry = String::from_utf8_lossy(pcr_entry.as_ref()).to_string();
            let value = format!("{},", pcr_entry);
            csv.push_str(&value);
        } else {
            csv.push_str(",");
        }
    }

    let csv = CString::new(csv).unwrap();
    let csv = csv.as_bytes_with_nul();
    let csv_buf = unsafe { slice::from_raw_parts_mut(csv_buf, csv_buf_len) };

    let out_len = std::cmp::min(csv.len(), csv_buf.len());
    csv_buf[..out_len].copy_from_slice(&csv[..out_len]);

    return 0
}

fn main() {
    println!("");
}
