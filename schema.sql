-- schema.sql

-- Create Employees table (note that SQLite doesn't have AUTO_INCREMENT the same way MySQL does; 
-- it uses "INTEGER PRIMARY KEY AUTOINCREMENT" for an autoincrementing primary key)

CREATE TABLE IF NOT EXISTS Employees (
    employee_id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name VARCHAR(255) NOT NULL,
    date_of_birth DATE NOT NULL,
    -- SQLite doesn't have ENUM, so we use TEXT plus a CHECK constraint for 'Male' or 'Female'
    gender TEXT NOT NULL CHECK(gender IN ('Male','Female')),
    photo TEXT,
    -- pin_code for the 4-digit PIN
    pin_code VARCHAR(4)
);

-- Create Contact table
CREATE TABLE IF NOT EXISTS Contact (
    contact_id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INT NOT NULL,
    address VARCHAR(255),
    phone_number VARCHAR(15),
    email_personal VARCHAR(255),
    email_corporate VARCHAR(255),
    emergency_contact_name VARCHAR(255),
    FOREIGN KEY (employee_id) REFERENCES Employees(employee_id)
);

-- Create Administration table
CREATE TABLE IF NOT EXISTS Administration (
    admin_id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INT NOT NULL,
    dni_nie_document TEXT,
    bank_account_document TEXT,
    social_security_document TEXT,
    employment_status VARCHAR(50),
    FOREIGN KEY (employee_id) REFERENCES Employees(employee_id)
);

-- Create Academics table
CREATE TABLE IF NOT EXISTS Academics (
    academic_id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INT NOT NULL,
    cv_document TEXT,
    certifications_document TEXT,
    FOREIGN KEY (employee_id) REFERENCES Employees(employee_id)
);

-- Create JobDescription table
CREATE TABLE IF NOT EXISTS JobDescription (
    job_id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_title VARCHAR(255),
    job_description TEXT,
    job_requirements TEXT,
    job_qualifications TEXT,
    department VARCHAR(100)
);

-- Create WorkDetails table
CREATE TABLE IF NOT EXISTS WorkDetails (
    work_id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INT NOT NULL,
    job_id INT NOT NULL,
    date_joined DATE,
    contract_start_date DATE,
    contract_end_date DATE,
    supervisor_name VARCHAR(255),
    FOREIGN KEY (employee_id) REFERENCES Employees(employee_id),
    FOREIGN KEY (job_id) REFERENCES JobDescription(job_id)
);

-- Create Compensation table
CREATE TABLE IF NOT EXISTS Compensation (
    compensation_id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INT NOT NULL,
    annual_salary DECIMAL(10, 2),
    contract_type VARCHAR(50),
    work_hours INT,
    FOREIGN KEY (employee_id) REFERENCES Employees(employee_id)
);

-- Create Activities table
CREATE TABLE IF NOT EXISTS Activities (
    activity_id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INT NOT NULL,
    employment_history TEXT,
    disciplinary_history TEXT,
    FOREIGN KEY (employee_id) REFERENCES Employees(employee_id)
);

-- Create Fitxatge table
CREATE TABLE IF NOT EXISTS Fitxatge (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    Dia DATE NOT NULL,          -- e.g. "2025-01-23"
    Hora TIME NOT NULL,         -- e.g. "08:30:00"
    employee_id INT NOT NULL,
    Working BOOLEAN DEFAULT 0,
    Active BOOLEAN DEFAULT 0,
    Hores_Diaries TIME DEFAULT '00:00:00',
    Hores_Setmanals TIME DEFAULT '00:00:00',
    Hores_Mensuals TIME DEFAULT '00:00:00',
    Vacances INT DEFAULT 0,
    FOREIGN KEY (employee_id) REFERENCES Employees(employee_id)
);

-- Create Baixes table
CREATE TABLE IF NOT EXISTS Baixes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INT NOT NULL,
    Dia_Inici DATE NOT NULL,
    Num_dias INT NOT NULL,
    Type VARCHAR(255) NOT NULL,
    FOREIGN KEY (employee_id) REFERENCES Employees(employee_id)
);
