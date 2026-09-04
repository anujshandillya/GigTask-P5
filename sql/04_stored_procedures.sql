--  Workflow 1 - Atomic Gig Funding Procedure
CREATE OR REPLACE PROCEDURE fund_gig(
    p_client_id UUID,
    p_freelancer_id UUID,
    p_budget DECIMAL(10,2)
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_balance NUMERIC(10,2);
BEGIN

    -- validate budget
    IF p_budget <= 0 THEN
        RAISE EXCEPTION 'Budget must be greater than zero';
    END IF;

    -- lock the client row and get current balance
    SELECT escrow_balance
    INTO v_balance
    FROM clients
    WHERE id = p_client_id
    FOR UPDATE;

    -- check client exists
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Client does not exist';
    END IF;

    -- check sufficient funds
    IF v_balance < p_budget THEN
        RAISE EXCEPTION
            'Insufficient escrow balance. Available: %, Required: %',
            v_balance, p_budget;
    END IF;

    -- deduct escrow balance
    UPDATE clients
    SET escrow_balance = escrow_balance - p_budget
    WHERE id = p_client_id;

    -- create the funded contract
    INSERT INTO contracts (
        id,
        client_id,
        freelancer_id,
        budget,
        status
    )
    VALUES (
        gen_random_uuid(),
        p_client_id,
        p_freelancer_id,
        p_budget,
        'FUNDED'
    );

END;
$$;
