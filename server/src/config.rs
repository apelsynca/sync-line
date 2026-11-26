use std::error::Error;
use url::Url;

pub struct Config {
    pub database_url: String,
    pub bind_addr: String,
    pub app_origin: Url,
    pub mail: MailConfig,
    pub agent: AgentConfig,
}

pub enum MailConfig {
    Logger,
    Smtp { url: String, from: String },
}

pub struct AgentConfig {
    pub base_url: String,
    pub model: Option<String>,
    pub api_key: Option<String>,
}

impl Config {
    pub fn from_env() -> Result<Self, Box<dyn Error>> {
        let mail = match dotenvy::var("MAIL_TRANSPORT").as_deref() {
            Ok("logger") => MailConfig::Logger,
            Ok("smtp") => MailConfig::Smtp {
                url: setting("SMTP_URL", "smtp://localhost:25"),
                from: setting("MAIL_FROM", "sync-line@localhost"),
            },
            _ => return Err("Set MAIL_TRANSPORT to logger or smtp.".into()),
        };
        let app_origin = Url::parse(&setting("APP_ORIGIN", "http://localhost:5173"))?;
        if !matches!(app_origin.scheme(), "https" | "http")
            || !app_origin.has_host()
            || app_origin.path() != "/"
            || app_origin.query().is_some()
            || app_origin.fragment().is_some()
            || !app_origin.username().is_empty()
            || app_origin.password().is_some()
        {
            return Err("APP_ORIGIN must be the browser app's HTTP(S) origin.".into());
        }

        Ok(Self {
            database_url: dotenvy::var("DATABASE_URL")?,
            bind_addr: setting("BIND_ADDR", "127.0.0.1:3000"),
            app_origin,
            mail,
            agent: AgentConfig {
                base_url: setting("AGENT_BASE_URL", "https://api.openai.com/v1"),
                model: optional("AGENT_MODEL"),
                api_key: optional("AGENT_API_KEY"),
            },
        })
    }
}

fn setting(key: &str, default: &str) -> String {
    dotenvy::var(key).unwrap_or_else(|_| default.into())
}

fn optional(key: &str) -> Option<String> {
    dotenvy::var(key).ok().filter(|s| !s.trim().is_empty())
}
