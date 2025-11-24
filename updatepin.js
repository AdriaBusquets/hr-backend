// assignPins.js
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('my-hr-database.sqlite');

function generate4DigitPin() {
  const randomNum = Math.floor(Math.random() * 10000);
  return String(randomNum).padStart(4, '0');
}

db.serialize(() => {
  // 1) Get all employees who don't have a PIN set
  db.all(
    `SELECT employee_id FROM employees
     WHERE pin_code IS NULL OR pin_code = ''`,
    (err, rows) => {
      if (err) {
        console.error('Error fetching employees without pin_code:', err);
        return;
      }

      // We'll store used pins in a set to guarantee uniqueness
      const usedPins = new Set();

      // 2) Query existing pins to avoid collisions with them too
      db.all(
        `SELECT pin_code FROM employees
         WHERE pin_code IS NOT NULL AND pin_code != ''`,
        (err2, pinRows) => {
          if (err2) {
            console.error('Error fetching existing pin_codes:', err2);
            return;
          }
          pinRows.forEach((r) => usedPins.add(r.pin_code));

          // 3) Loop over each employee needing a pin
          rows.forEach((row) => {
            let newPin;
            do {
              newPin = generate4DigitPin();
            } while (usedPins.has(newPin));

            usedPins.add(newPin);

            // 4) Update the employee record
            db.run(
              `UPDATE Employees SET pin_code = ? WHERE employee_id = ?`,
              [newPin, row.employee_id],
              (updateErr) => {
                if (updateErr) {
                  console.error(
                    `Error assigning pin_code to employee_id=${row.employee_id}`,
                    updateErr
                  );
                }
              }
            );
          });

          // 5) CLOSE DATABASE after all updates are queued
          db.close((closeErr) => {
            if (closeErr) {
              console.error('Error closing the database:', closeErr);
            } else {
              console.log('All pins assigned; database closed successfully.');
            }
          });
        }
      );
    }
  );
});
