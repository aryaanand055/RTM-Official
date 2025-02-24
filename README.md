# Attendance Management System

This project is a web-based attendance management system designed to track students who arrive late. Teachers can scan student ID cards, retrieve the roll number, and display the student's details. A reason for lateness is then entered and saved along with the timestamp in the database for future reference.

## Features

- **Barcode Scanning**: Scan student IDs to retrieve roll numbers using a browser-based QR code scanner.
- **Student Lookup**: Retrieve and display student details from the database using the roll number.
- **Lateness Reason**: Input and save a reason for student lateness.
- **Database Storage**: Store student ID, timestamp, and reason in a dedicated late attendance database.

## Tech Stack

- **Frontend**: HTML, CSS, JavaScript
- **Backend**: Node.js with Express
- **Database**: MySQL 

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) (v14.x or higher)
- MySQL
- A barcode scanner (phone camera/webcam)

### Steps to Run the Project

1. **Clone the Repository**
   ```bash
   git clone https://github.com/aryaanand055/Real-Time-Management.git
   cd into the folder
2. **Install the dependencies**
```npm install```

3. **Set Up the Database**
Create a MySQL database for the attendance management system. Use the following SQL commands to create the necessary tables:
```
CREATE TABLE Student_Data (
    Reg_No CHAR(15) PRIMARY KEY,
    Student_Name VARCHAR(50) NOT NULL UNIQUE,
    Department CHAR(5) NOT NULL,
    YearOfStudy INT NOT NULL,
    Section CHAR(1) NOT NULL,
    Gender char(1) not null,
    DOB date not null,
    Mob_no VARCHAR(15) NOT NULL UNIQUE,
    Mail_Id VARCHAR(40) NOT NULL UNIQUE,
    Residence VARCHAR(15) NOT NULL
);

CREATE TABLE Student_Absent_Data (
    Reg_No CHAR(15),
    Staff_Reg_No CHAR(15),
    Reason VARCHAR(58) NOT NULL,
    Late_Date DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (Reg_No, Late_Date),
    FOREIGN KEY (Reg_No) REFERENCES Student_Data(Reg_No),
    FOREIGN KEY (Staff_Reg_No) REFERENCES staff_data(Reg_No)
);

CREATE TABLE IF NOT EXISTS staff_data (
    Reg_No CHAR(15) PRIMARY KEY,
    Password VARCHAR(255) NOT NULL,
    Staff_Name VARCHAR(50) NOT NULL,
    Department CHAR(5) NOT NULL,
    Mail_Id VARCHAR(50) NOT NULL,
    Mob_No VARCHAR(15) NOT NULL,
    Access_Role INT NOT NULL,
    YearOfClass INT,
    Section CHAR(2)
);
```

4. **Configure Database Connection** 
In the project directory, create a .env file and add your database configuration:
```
DB_HOST=localhost
DB_USER=your_database_user
DB_PASSWORD=your_database_password
DB_NAME=your_database_name
JWT_SECRET=your_secret_key
```

6. **Run the Server** Start the Node.js server by running:
```node index.js```

7. **Access the Application**
Open your web browser and go to http://localhost:3000 (or the port your server is configured to use).
