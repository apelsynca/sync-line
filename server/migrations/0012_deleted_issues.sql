-- Keep the UUID and ENG number reserved when an offline client retries a write.
ALTER TABLE issues ADD COLUMN deleted boolean NOT NULL DEFAULT false;
