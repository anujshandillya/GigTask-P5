CREATE TABLE clients(
	id UUID PRIMARY KEY,
	name VARCHAR(100),
	escrow_balance DECIMAL(10,2) CHECK (escrow_balance >= 0.00)
);

CREATE TABLE wallet_audit_logs(
	id UUID PRIMARY KEY,
	client_id UUID REFERENCES clients(id),
	amount_changed INT,
	action_type VARCHAR(20),
	balance_after DECIMAL(10,2) CHECK (balance_after >= 0.00),
	timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE freelancers(
	id UUID PRIMARY KEY,
	name VARCHAR(100),
	latitude FLOAT4,
	longitude FLOAT4,
	is_available BOOLEAN
);

CREATE TABLE contracts(
	id UUID PRIMARY KEY,
	client_id UUID REFERENCES clients(id),
	freelancer_id UUID REFERENCES freelancers(id),
	budget FLOAT4,
	status VARCHAR(20)
);

ALTER TABLE contracts ADD CONSTRAINT status_check CHECK(status IN ('FUNDED', 'IN_PROGRESS', 'COMPLETED'))