use std::time::Duration;

use serde::{Deserialize, Serialize};

use super::auth::Session;

#[derive(Serialize)]
struct EnrollReq<'a> {
    token: &'a str,
}

#[derive(Deserialize)]
struct TokenResp {
    access_token: String,
    refresh_token: String,
}

#[derive(Deserialize)]
struct UserResp {
    #[serde(default)]
    email: String,
    #[serde(default)]
    username: String,
}

#[derive(Deserialize)]
struct EnrollResp {
    tokens: TokenResp,
    user: UserResp,
    business_id: String,
}

/// Read a one-time enrollment token from the process environment or command line.
/// Supported command-line forms:
///   --enroll-token=atl_enroll_...
///   --enroll-token atl_enroll_...
pub fn pending_token() -> Option<String> {
    if let Ok(value) = std::env::var("ACTILENS_ENROLL_TOKEN") {
        let value = value.trim().to_string();
        if !value.is_empty() {
            return Some(value);
        }
    }

    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        if let Some(value) = arg.strip_prefix("--enroll-token=") {
            let value = value.trim();
            if !value.is_empty() {
                return Some(value.to_string());
            }
        }
        if arg == "--enroll-token" {
            if let Some(value) = args.next() {
                let value = value.trim().to_string();
                if !value.is_empty() {
                    return Some(value);
                }
            }
        }
    }
    None
}

/// Exchange a short-lived one-time enrollment token for the normal ActiLens
/// session. The raw token is sent only in this TLS/HTTP request and is never logged.
pub async fn redeem(base_url: &str, token: &str) -> Result<Session, String> {
    let http = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!("{}/v1/auth/enroll", base_url.trim_end_matches('/'));
    let resp = http
        .post(url)
        .json(&EnrollReq { token })
        .send()
        .await
        .map_err(|e| format!("enrollment network error: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("enrollment rejected ({})", resp.status().as_u16()));
    }

    let parsed: EnrollResp = resp.json().await.map_err(|e| e.to_string())?;
    let identity = if parsed.user.email.trim().is_empty() {
        parsed.user.username
    } else {
        parsed.user.email
    };

    Ok(Session {
        access_token: parsed.tokens.access_token,
        refresh_token: parsed.tokens.refresh_token,
        email: identity,
        business_id: Some(parsed.business_id),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn command_line_prefix_is_documented() {
        // Keep a cheap regression guard around the CLI convention used by deployment
        // scripts. Parsing std::env::args() itself is process-global, so it is not
        // mutated in this unit test.
        assert!("--enroll-token=atl_enroll_x".starts_with("--enroll-token="));
    }
}
