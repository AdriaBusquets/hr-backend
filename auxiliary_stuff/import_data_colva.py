import sqlite3
import pandas as pd

# Update these to your actual paths:
DB_PATH = "my-hr-database.sqlite"  # Path to your SQLite database file
EXCEL_PATH = "COLVA.xlsx"       # Path to the new Excel file

def main():
    # 1) Read the Excel file
    df = pd.read_excel(EXCEL_PATH)

    # 2) Connect to the SQLite database
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Optional: start one big transaction
    cursor.execute("BEGIN TRANSACTION;")

    # 3) Loop over each row in the DataFrame
    for idx, row in df.iterrows():
        # Extract row data as strings
        persona = str(row.get('Persona trabajadora', '')).replace("'", "''")
        fecha_antig = str(row.get('Fecha antiguidad', '')).split(' ')[0]  # remove time portion
        contrato = str(row.get('Contrato', '')).replace("'", "''")
        dni = str(row.get('DNI', '')).replace("'", "''")
        fecha_nac = str(row.get('Fecha nacimiento', '')).split(' ')[0]
        direccion = str(row.get('Dirección', '')).replace("'", "''")
        telefono = str(row.get('Teléfono', '')).replace("'", "''")
        email = str(row.get('Correo electrónico', '')).replace("'", "''")
        cuenta_bancaria = str(row.get('Cuenta bancaria', '')).replace("'", "''")

        # Convert “Sexo” to 'Male'/'Female' if possible, default to 'Male'
        raw_sexo = str(row.get('Sexo', '')).strip().lower()
        if raw_sexo.startswith('f'):
            sexo = 'Female'
        else:
            sexo = 'Male'

        # 4) Insert into Employees
        insert_employees = f"""
            INSERT INTO Employees (full_name, date_of_birth, gender, pin_code, photo)
            VALUES ('{persona}', '{fecha_nac}', '{sexo}', '', NULL);
        """
        cursor.execute(insert_employees)

        # The newly created employee_id
        employee_id = cursor.lastrowid

        # 5) Insert into Contact
        insert_contact = f"""
            INSERT INTO Contact (
                employee_id, address, phone_number, email_personal,
                email_corporate, emergency_contact_name
            )
            VALUES (
                {employee_id},
                '{direccion}',
                '{telefono}',
                '{email}',
                '',
                ''
            );
        """
        cursor.execute(insert_contact)

        # 6) Insert into Administration
        # We'll store DNI/bank info in 'employment_status' as a placeholder
        insert_admin = f"""
            INSERT INTO Administration (
                employee_id, dni_nie_document, bank_account_document,
                social_security_document, employment_status
            )
            VALUES (
                {employee_id},
                NULL,
                NULL,
                NULL,
                'DNI:{dni}, Bank:{cuenta_bancaria}'
            );
        """
        cursor.execute(insert_admin)

        # 7) Insert into Compensation
        # Put the contract text in contract_type
        insert_comp = f"""
            INSERT INTO Compensation (
                employee_id, annual_salary, contract_type, work_hours
            )
            VALUES (
                {employee_id},
                NULL,
                '{contrato}',
                NULL
            );
        """
        cursor.execute(insert_comp)

        # 8) Insert into WorkDetails
        # We'll interpret "Fecha antiguidad" as date_joined
        insert_workdetails = f"""
            INSERT INTO WorkDetails (
                employee_id, supervisor_name, job_id,
                date_joined, contract_start_date, contract_end_date
            )
            VALUES (
                {employee_id},
                '',
                NULL,
                '{fecha_antig}',
                '',
                ''
            );
        """
        cursor.execute(insert_workdetails)

        print(f"Row {idx+1} -> employee_id={employee_id} inserted: {persona}")

    # Commit the big transaction
    cursor.execute("COMMIT;")
    conn.close()
    print("\nAll rows have been inserted successfully!")

if __name__ == "__main__":
    main()
