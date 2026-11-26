use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor, message::Mailbox};
use std::{
    error::Error,
    io::{self, Write},
    sync::Arc,
    time::Duration,
};

#[derive(Clone)]
pub enum MailTransport {
    Logger,
    Smtp(Arc<Smtp>),
}

pub struct Smtp {
    transport: AsyncSmtpTransport<Tokio1Executor>,
    from: Mailbox,
}

impl MailTransport {
    pub fn configured() -> Result<Self, Box<dyn Error>> {
        match dotenvy::var("MAIL_TRANSPORT").as_deref() {
            Ok("logger") => Ok(Self::Logger),
            Ok("smtp") => {
                let url = dotenvy::var("SMTP_URL").unwrap_or_else(|_| "smtp://localhost:25".into());
                let from =
                    dotenvy::var("MAIL_FROM").unwrap_or_else(|_| "sync-line@localhost".into());
                let transport = AsyncSmtpTransport::<Tokio1Executor>::from_url(&url)?
                    .timeout(Some(Duration::from_secs(10)))
                    .build();
                Ok(Self::Smtp(Arc::new(Smtp {
                    transport,
                    from: from.parse()?,
                })))
            }
            _ => Err("Set MAIL_TRANSPORT to logger or smtp.".into()),
        }
    }

    pub async fn deliver(
        &self,
        email: &str,
        subject: &str,
        body: &str,
    ) -> Result<(), Box<dyn Error + Send + Sync>> {
        match self {
            Self::Logger => writeln!(io::stdout().lock(), "{subject} for {email}: {body}")?,
            Self::Smtp(smtp) => {
                let message = Message::builder()
                    .from(smtp.from.clone())
                    .to(email.parse()?)
                    .subject(subject)
                    .body(body.to_owned())?;
                smtp.transport.send(message).await?;
            }
        }
        Ok(())
    }
}
