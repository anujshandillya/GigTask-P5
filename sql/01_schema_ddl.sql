CREATE TYPE contract_status AS ENUM ('FUNDED', 'IN_PROGRESS', 'COMPLETED');
CREATE TYPE audit_action_type AS ENUM ('CREDIT', 'DEBIT');

CREATE TABLE clients(
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	name VARCHAR(100),
	escrow_balance DECIMAL(10,2) CHECK (escrow_balance >= 0.00)
);

CREATE TABLE wallet_audit_logs(
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	client_id UUID REFERENCES clients(id),
	amount_changed DECIMAL(10,2),
	action_type audit_action_type NOT NULL,
	balance_after DECIMAL(10,2) CHECK (balance_after >= 0.00),
	timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE freelancers(
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	name VARCHAR(100),
	latitude FLOAT4,
	longitude FLOAT4,
	is_available BOOLEAN
);

CREATE TABLE contracts(
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	client_id UUID REFERENCES clients(id),
	freelancer_id UUID REFERENCES freelancers(id),
	budget DECIMAL(10,2),
	status contract_status NOT NULL DEFAULT 'IN_PROGRESS',
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE contracts ADD CONSTRAINT status_check CHECK(status IN ('FUNDED', 'IN_PROGRESS', 'COMPLETED'))