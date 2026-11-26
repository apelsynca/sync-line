use crate::config::MailConfig;
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
    pub fn new(config: MailConfig) -> Result<Self, Box<dyn Error>> {
        match config {
            MailConfig::Logger => Ok(Self::Logger),
            MailConfig::Smtp { url, from } => {
                let transport = AsyncSmtpTransport::<Tokio1Executor>::from_url(&url)?
                    .timeout(Some(Duration::from_secs(10)))
                    .build();
                Ok(Self::Smtp(Arc::new(Smtp {
                    transport,
                    from: from.parse()?,
                })))
            }
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
