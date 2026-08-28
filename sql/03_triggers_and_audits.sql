CREATE OR REPLACE FUNCTION log_escrow_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO wallet_audit_logs
        (id, client_id, amount_changed, action_type, balance_after)
    VALUES
        (
            gen_random_uuid(),
            NEW.id,
            NEW.escrow_balance - OLD.escrow_balance,
            CASE
                WHEN NEW.escrow_balance > OLD.escrow_balance
                    THEN 'CREDIT'
                ELSE 'DEBIT'
            END,
            NEW.escrow_balance
        );

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_escrow_audit
AFTER UPDATE OF escrow_balance
ON clients
FOR EACH ROW
WHEN (OLD.escrow_balance IS DISTINCT FROM NEW.escrow_balance)
EXECUTE FUNCTION log_escrow_change();

CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'wallet_audit_logs is immutable';
END;
$$;

CREATE TRIGGER trg_prevent_audit_modification
BEFORE UPDATE OR DELETE
ON wallet_audit_logs
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_modification();
