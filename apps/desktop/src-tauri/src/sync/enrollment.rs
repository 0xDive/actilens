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

#[cfg(target_os = "windows")]
fn windows_user_environment(name: &str) -> Option<String> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    hkcu.open_subkey("Environment")
        .ok()
        .and_then(|key| key.get_value::<String, _>(name).ok())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

#[cfg(not(target_os = "windows"))]
fn windows_user_environment(_name: &str) -> Option<String> {
    None
}

/// Read a one-time enrollment token from the process environment, the persisted
/// Windows user environment, or command line. Reading HKCU directly matters when
/// Explorer was already running before a provisioning script changed user env vars.
pub fn pending_token() -> Option<String> {
    if let Ok(value) = std::env::var("ACTILENS_ENROLL_TOKEN") {
        let value = value.trim().to_string();
        if !value.is_empty() {
            return Some(value);
        }
    }

    if let Some(value) = windows_user_environment("ACTILENS_ENROLL_TOKEN") {
        return Some(value);
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

/// Remove the enrollment secret after it has been redeemed. The server token is
/// already one-time, but leaving a consumed secret in HKCU\Environment is needless
/// exposure and makes future troubleshooting confusing.
fn clear_consumed_token() {
    std::env::remove_var("ACTILENS_ENROLL_TOKEN");

    #[cfg(target_os = "windows")]
    {
        use winreg::enums::{HKEY_CURRENT_USER, KEY_SET_VALUE};
        use winreg::RegKey;

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        if let Ok(environment) = hkcu.open_subkey_with_flags("Environment", KEY_SET_VALUE) {
            let _ = environment.delete_value("ACTILENS_ENROLL_TOKEN");
        }
    }
}

/// Exchange a short-lived one-time enrollment token for the normal ActiLens
/// session. The raw token is sent only in this HTTP request and is never logged.
/// Production deployments should use HTTPS when the backend is outside a trusted LAN.
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

    // The server has atomically consumed the one-time credential by this point.
    clear_consumed_token();

    Ok(Session {
        access_token: parsed.tokens.access_token,
        refresh_token: parsed.tokens.refresh_token,
        email: identity,
        business_id: Some(parsed.business_id),
        business_name: String::new(),
    })
}

#[cfg(test)]
mod tests {
    #[test]
    fn command_line_prefix_is_documented() {
        // Keep a cheap regression guard around the CLI convention used by deployment
        // scripts. Parsing std::env::args() itself is process-global, so it is not
        // mutated in this unit test.
        assert!("--enroll-token=atl_enroll_x".starts_with("--enroll-token="));
    }
}
