require('dotenv').config();
const path = require("path");
const express = require('express');
const app = express();
const cors = require("cors");
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const mysql = require('mysql2');
const expressLayouts = require('express-ejs-layouts');
const multer = require('multer');
const XLSX = require('xlsx');

// Port
const portToUse = 8090;
const expTime = 3600; // in seconds

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.use(cors({ origin: "https://sdc2.psgitech.ac.in/lateattendance" }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(expressLayouts);
app.set('layout', 'master');
app.set('views', path.join(__dirname, 'views'));

// Multer setup
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Database Connection
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});

db.connect(err => {
    if (err) {
        console.error('MySQL Connection Error:', err);
        throw err;
    }
    console.log('MySQL Connected...');
});

setInterval(() => {
    db.query('SELECT 1', (err) => {
        if (err) console.error('Error keeping MySQL connection alive:', err);
        else console.log('MySQL Connection kept alive');
    });
}, 60 * 60 * 1000);

// Authentication Middleware
const checkIfLoggedIn = (req, res, next) => {
    const token = req.cookies.logintoken;
    if (!token) {
        req.isLoggedIn = false;
        return next();
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, result) => {
        if (err || !result) {
            req.isLoggedIn = false;
            return next();
        }
        db.query("SELECT * FROM staff_data WHERE Reg_No = ?", [result.Reg_No], (err, resu) => {
            if (err || resu.length === 0) {
                req.isLoggedIn = false;
                return next();
            }
            req.isLoggedIn = true;
            req.user = { Reg_No: result.Reg_No, accessRole: resu[0].Access_Role, Dept: resu[0].Department };
            next();
        });
    });
};

const authenticateJWT = (allowedRoles = []) => {
    return (req, res, next) => {
        const token = req.cookies.logintoken;
        if (!token) {
            return res.redirect(`/lateattendance/login?redirect=${encodeURIComponent(req.originalUrl)}&msg=${encodeURIComponent("Please login to continue")}`);
        }

        jwt.verify(token, process.env.JWT_SECRET, (err, resultVer) => {
            if (err) {
                return res.redirect(`/lateattendance/login?redirect=${encodeURIComponent(req.originalUrl)}&msg=${encodeURIComponent("Login has expired. Please login again")}`);
            }

            const { Reg_No } = resultVer;
            db.query('SELECT * FROM staff_data WHERE Reg_No = ?', [Reg_No], (err, results) => {
                if (err || results.length === 0) {
                    return res.send("User not found");
                }

                const userRole = results[0].Access_Role;
                const dept = results[0].Department;

                if (!allowedRoles.includes(userRole)) {
                    return res.render('accessDenied', {
                        title: 'Access Denied',
                        message: 'Classified Information.',
                    });
                }

                const newToken = jwt.sign(
                    { Reg_No, Access_Role: userRole, Dept: dept },
                    process.env.JWT_SECRET,
                    { expiresIn: expTime }
                );
                res.cookie('logintoken', newToken, { httpOnly: true, secure: false, sameSite: 'Strict' });

                req.user = { Reg_No, accessRole: userRole, Dept: dept };
                next();
            });
        });
    };
};

app.use(checkIfLoggedIn);
app.use((req, res, next) => {
    res.locals.isAuthenticated = req.user ? true : false;
    next();
});

// Routes
app.get("/lateattendance/", (req, res) => {
    if (req.isLoggedIn) return res.redirect("/lateattendance/dashboard");
    res.redirect("/lateattendance/login");
});

app.get('/lateattendance/dashboard', authenticateJWT([2, 3, 4]), (req, res) => {
    const mesg = req.query.msg;
    const userRegNo = req.user.Reg_No;
    const accessRole = req.user.accessRole;
    db.query("SELECT * FROM staff_data WHERE Reg_No = ?", [userRegNo], (err, result) => {
        if (err || result.length === 0) return res.send('Error fetching records');

        const dept = result[0].Department;
        let attendanceQuery, queryParams;

        if (accessRole === 4) {
            attendanceQuery = `
                SELECT 
                    COUNT(CASE WHEN DATE(Late_Date) = CURDATE() THEN 1 END) AS today,
                    COUNT(CASE WHEN Late_Date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) THEN 1 END) AS last7Days,
                    COUNT(CASE WHEN Late_Date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN 1 END) AS last30Days
                FROM student_absent_data a, student_data b
                WHERE a.Reg_No = b.Reg_No`;
            queryParams = [];
        } else {
            attendanceQuery = `
                SELECT 
                    COUNT(CASE WHEN DATE(Late_Date) = CURDATE() THEN 1 END) AS today,
                    COUNT(CASE WHEN Late_Date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) THEN 1 END) AS last7Days,
                    COUNT(CASE WHEN Late_Date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN 1 END) AS last30Days
                FROM student_absent_data a, student_data b
                WHERE a.Reg_No = b.Reg_No AND b.Department = ?`;
            queryParams = [dept];
        }

        db.query(attendanceQuery, queryParams, (err, attendanceResults) => {
            if (err) return res.send('Error fetching attendance data');

            const prevData = [
                { 'Total Late Attendances (Today)': attendanceResults[0].today },
                { 'Total Late Attendances (Last 7 days)': attendanceResults[0].last7Days },
                { 'Total Late Attendances (Last 30 days)': attendanceResults[0].last30Days },
            ];

            const recentActivityQuery = accessRole === 4
                ? `SELECT a.Reg_No, Late_Date, Student_Name, Section, YearOfStudy 
                   FROM student_absent_data a, student_data b
                   WHERE a.Reg_No = b.Reg_No
                   ORDER BY Late_Date DESC
                   LIMIT 10`
                : `SELECT a.Reg_No, Late_Date, Student_Name, Section, YearOfStudy 
                   FROM student_absent_data a, student_data b
                   WHERE a.Reg_No = b.Reg_No AND Department = ?
                   ORDER BY Late_Date DESC
                   LIMIT 10`;

            db.query(recentActivityQuery, accessRole === 4 ? [] : [dept], (err, recentActivities) => {
                if (err) return res.send('Error fetching recent activity');

                const query = accessRole === 4
                    ? `SELECT a.Reg_No, Late_Date, Student_Name, Section, YearOfStudy, Reason
                       FROM student_absent_data a, student_data b
                       WHERE a.Reg_No = b.Reg_No
                       ORDER BY Late_Date DESC`
                    : `SELECT a.Reg_No, Late_Date, Student_Name, Section, YearOfStudy, Reason
                       FROM student_absent_data a, student_data b
                       WHERE a.Reg_No = b.Reg_No AND b.Department = ?
                       ORDER BY Late_Date DESC`;

                db.query(query, accessRole === 4 ? [] : [dept], (err, records) => {
                    if (err) return res.status(500).send('Server error');

                    db.query('SELECT * FROM staff_data WHERE Reg_No = ?', [userRegNo], (err, result) => {
                        if (err || result.length === 0) return res.status(500).json({ error: 'Error fetching staff data' });

                        const dept = result[0].Department;
                        const YOS = result[0].YearOfClass;
                        const Sec = result[0].Section;

                        if (accessRole === 4 || (!YOS && !Sec)) {
                            const dailyAttendanceQuery = accessRole === 4
                                ? `SELECT 
                                      DATE(Late_Date) AS lateDate,
                                      Section,
                                      YearOfStudy,
                                      COUNT(*) AS lateCount
                                   FROM student_absent_data a
                                   JOIN student_data b ON a.Reg_No = b.Reg_No
                                   WHERE Late_Date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
                                   GROUP BY lateDate, Section, YearOfStudy
                                   ORDER BY YearOfStudy ASC, Section ASC, lateDate ASC`
                                : `SELECT 
                                      DATE(Late_Date) AS lateDate,
                                      Section,
                                      YearOfStudy,
                                      COUNT(*) AS lateCount
                                   FROM student_absent_data a
                                   JOIN student_data b ON a.Reg_No = b.Reg_No
                                   WHERE b.Department = ?
                                   AND Late_Date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
                                   GROUP BY lateDate, Section, YearOfStudy
                                   ORDER BY YearOfStudy ASC, Section ASC, lateDate ASC`;

                            db.query(dailyAttendanceQuery, accessRole === 4 ? [] : [dept], (err, results) => {
                                if (err) return res.status(500).json({ error: 'Error fetching daily attendance data' });
                                res.render('dashboard', {
                                    title: accessRole === 4 ? 'Admin Dashboard' : 'Dashboard',
                                    msg: mesg,
                                    deptName: accessRole === 4 ? 'All Departments' : dept,
                                    dept: dept,
                                    prevData: prevData,
                                    recentActivities: recentActivities,
                                    records: records,
                                    attendanceResults: results,
                                    studentData: {},
                                    studentData1: {},
                                });
                            });
                        } else {
                            const dailyAttendanceQuery = `
                                SELECT 
                                    DATE(Late_Date) AS lateDate,
                                    Section,
                                    YearOfStudy,
                                    COUNT(*) AS lateCount
                                FROM student_absent_data a
                                JOIN student_data b ON a.Reg_No = b.Reg_No
                                WHERE b.Department = ? AND b.YearOfStudy = ? AND b.Section = ?
                                AND Late_Date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
                                GROUP BY lateDate, Section, YearOfStudy
                                ORDER BY YearOfStudy ASC, Section ASC, lateDate ASC`;

                            db.query(dailyAttendanceQuery, [dept, YOS, Sec], (err, results) => {
                                if (err) return res.status(500).json({ error: 'Error fetching daily attendance data' });

                                let studentData = {};
                                records.forEach(record => {
                                    if (record.YearOfStudy === YOS && record.Section === Sec) {
                                        if (studentData[record.Reg_No]) {
                                            studentData[record.Reg_No].count += 1;
                                        } else {
                                            studentData[record.Reg_No] = {
                                                name: record.Student_Name,
                                                count: 1,
                                            };
                                        }
                                    }
                                });
                                studentData = Object.entries(studentData)
                                    .map(([regNo, data]) => ({ regNo, ...data }))
                                    .sort((a, b) => b.count - a.count);

                                let studentData1 = [];
                                records.forEach(record => {
                                    if (
                                        record.Late_Date.toDateString() === new Date().toDateString() &&
                                        record.Section === Sec &&
                                        record.YearOfStudy === YOS
                                    ) {
                                        studentData1.push(record);
                                    }
                                });

                                res.render('dashboard', {
                                    title: 'Tutor Dashboard',
                                    tutor: true,
                                    YOS: YOS,
                                    section: Sec,
                                    msg: mesg,
                                    deptName: dept,
                                    dept: dept,
                                    prevData: prevData,
                                    recentActivities: recentActivities,
                                    records: records,
                                    attendanceResults: results,
                                    studentData: studentData,
                                    studentData1: studentData1,
                                });
                            });
                        }
                    });
                });
            });
        });
    });
});

app.get('/lateattendance/api/hod-dashboard/daily', authenticateJWT([2, 3, 4]), (req, res) => {
    const userRegNo = req.user.Reg_No;
    db.query("SELECT * FROM staff_data WHERE Reg_No = ?", [userRegNo], (err, result) => {
        if (err || result.length === 0) return res.status(500).json({ error: 'Error fetching staff data' });

        const dept = result[0].Department;
        const YOS = result[0].YearOfClass;
        const Sec = result[0].Section;
        const accessRole = req.user.accessRole;

        if (accessRole === 4) {
            const dailyAttendanceQuery = `
                SELECT 
                    DATE(Late_Date) AS lateDate,
                    Section,
                    YearOfStudy,
                    COUNT(*) AS lateCount
                FROM student_absent_data a
                JOIN student_data b ON a.Reg_No = b.Reg_No
                WHERE Late_Date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
                GROUP BY lateDate, Section, YearOfStudy
                ORDER BY YearOfStudy ASC, Section ASC, lateDate ASC`;
            db.query(dailyAttendanceQuery, [], (err, results) => {
                if (err) return res.status(500).json({ error: 'Error fetching daily attendance data' });
                return res.json(results);
            });
        } else if (!YOS && !Sec) {
            const dailyAttendanceQuery = `
                SELECT 
                    DATE(Late_Date) AS lateDate,
                    Section,
                    YearOfStudy,
                    COUNT(*) AS lateCount
                FROM student_absent_data a
                JOIN student_data b ON a.Reg_No = b.Reg_No
                WHERE b.Department = ?
                AND Late_Date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
                GROUP BY lateDate, Section, YearOfStudy
                ORDER BY YearOfStudy ASC, Section ASC, lateDate ASC`;
            db.query(dailyAttendanceQuery, [dept], (err, results) => {
                if (err) return res.status(500).json({ error: 'Error fetching daily attendance data' });
                return res.json(results);
            });
        } else {
            const dailyAttendanceQuery = `
                SELECT 
                    DATE(Late_Date) AS lateDate,
                    Section,
                    YearOfStudy,
                    COUNT(*) AS lateCount
                FROM student_absent_data a
                JOIN student_data b ON a.Reg_No = b.Reg_No
                WHERE b.Department = ? AND b.YearOfStudy = ? AND b.Section = ?
                AND Late_Date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
                GROUP BY lateDate, Section, YearOfStudy
                ORDER BY YearOfStudy ASC, Section ASC, lateDate ASC`;
            db.query(dailyAttendanceQuery, [dept, YOS, Sec], (err, results) => {
                if (err) return res.status(500).json({ error: 'Error fetching daily attendance data' });
                return res.json(results);
            });
        }
    });
});

app.get('/lateattendance/login', checkIfLoggedIn, (req, res) => {
    if (req.isLoggedIn) {
        const redirectUrl = req.query.redirect || '/lateattendance/dashboard';
        const msg = "You are already logged in";
        return res.redirect(`${redirectUrl}?msg=${encodeURIComponent(msg)}`);
    }
    const mesg = req.query.msg;
    res.render("login", { title: "Login", redirectUrl: req.query.redirect || '/', msg: mesg });
});

app.post("/lateattendance/login", (req, res) => {
    const { Reg_No, password } = req.body;
    db.query("SELECT * FROM staff_data WHERE Reg_No = ?", [Reg_No], (err, result) => {
        if (err) {
            return res.json({ success: false, message: "Error occurred while logging in" });
        }
        if (result.length === 0) {
            return res.json({ success: false, message: "Authentication Unsuccessful. User not found" });
        }
        if (password === result[0].Password) {
            const token = jwt.sign(
                { Reg_No: result[0].Reg_No, Access_Role: result[0].Access_Role, Dept: result[0].Department },
                process.env.JWT_SECRET,
                { expiresIn: expTime }
            );
            res.cookie('logintoken', token, { httpOnly: true, secure: false, sameSite: 'Strict' });
            return res.status(200).json({
                success: true,
                message: "Login Successful",
                access_role: result[0].Access_Role,
            });
        }
        return res.json({ success: false, message: "Authentication Unsuccessful - Incorrect Password" });
    });
});

app.get('/lateattendance/logout', (req, res) => {
    res.clearCookie('logintoken', { httpOnly: true, secure: false, sameSite: 'Strict' });
    res.redirect('/lateattendance/login?msg=' + encodeURIComponent("You have been logged out successfully"));
});

app.get("/lateattendance/records", authenticateJWT([2, 3, 4]), (req, res) => {
    const userRegNo = req.user.Reg_No;
    db.query("SELECT * FROM staff_data WHERE Reg_No = ?", [userRegNo], (err, result) => {
        if (err || result.length === 0) return res.send('Error fetching records');
        const arole = result[0].Access_Role;
        if (arole === 2) return res.redirect("/lateattendance/records/class");
        if (arole === 3 || arole === 4) return res.redirect("/lateattendance/attendanceRecordsAll");
    });
});

app.get('/lateattendance/recordsall', authenticateJWT([2, 3, 4]), (req, res) => {
    db.query('SELECT * FROM student_data', (err, results) => {
        if (err) return res.send('Error fetching records');
        res.render('records', { students: results, title: "All classes" });
    });
});

app.get('/lateattendance/lateAbsenceForm', authenticateJWT([1, 2, 3, 4]), (req, res) => {
    res.render("lateAbsenceForm", { title: "Late Attendance Form" });
});

app.get("/lateattendance/records/class", authenticateJWT([2, 3, 4]), (req, res) => {
    const userRegNo = req.user.Reg_No;
    db.query("SELECT * FROM staff_data WHERE Reg_No = ?", [userRegNo], (err, result) => {
        if (err || result.length === 0) return res.send('Error fetching records');
        const dept = result[0].Department;
        const class1 = result[0].YearOfClass;
        const section = result[0].Section;
        if (class1 && section) {
            res.redirect(`/lateattendance/records/${dept}/${class1}/${section}`);
        } else {
            res.redirect('/lateattendance/records/dept');
        }
    });
});

app.get("/lateattendance/records/dept", authenticateJWT([3, 4]), (req, res) => {
    const userRegNo = req.user.Reg_No;
    db.query("SELECT * FROM staff_data WHERE Reg_No = ?", [userRegNo], (err, result) => {
        if (err || result.length === 0) return res.send('Error fetching records');
        const dept = result[0].Department;
        db.query(
            "SELECT YearOfStudy, Section, COUNT(*) as AbsenceCount FROM student_absent_data a, student_data b WHERE a.Reg_no = b.Reg_no AND Department = ? GROUP BY YearOfStudy, Section ORDER BY YearOfStudy, Section",
            [dept],
            (err, result) => {
                if (err) return res.send('Error fetching records');
                res.render("recordsPerDept", { data: result, deptName: dept.toUpperCase(), title: `Records for Department - ${dept}` });
            }
        );
    });
});

app.get("/lateattendance/records/:Dept/:Class/:Sec", authenticateJWT([2, 3, 4]), (req, res) => {
    const userRegNo = req.user.Reg_No;
    db.query("SELECT * FROM staff_data WHERE Reg_No = ?", [userRegNo], (err, result) => {
        if (err || result.length === 0) return res.send('Error fetching records');

        const { Dept, Class, Sec } = req.params;
        const aDept = result[0].Department;
        const aClass = result[0].YearOfClass;
        const aSection = result[0].Section;
        const aRole = result[0].Access_Role;

        const hasAccess =
            (aRole === 4) ||
            (aRole === 3 && aDept.toLowerCase() === Dept.toLowerCase()) ||
            (aRole === 2 && aDept.toLowerCase() === Dept.toLowerCase() && String(aClass) === String(Class) && aSection.toLowerCase() === Sec.toLowerCase());

        if (!hasAccess) {
            return res.send(`You do not have access to this data. Your current data is Dept: ${aDept}, class: ${aClass}, section: ${aSection}, role: ${aRole}`);
        }

        db.query(
            "SELECT * FROM student_absent_data a JOIN student_data b ON a.Reg_No = b.Reg_No WHERE Department = ? AND YearOfStudy = ? AND Section = ? ORDER BY Late_Date DESC",
            [Dept, Class, Sec],
            (err, results) => {
                if (err) return res.send('Error fetching records');

                function getOrdinal(num) {
                    const suffixes = ["st", "nd", "rd", "th", "th"];
                    return num + suffixes[num - 1];
                }

                const yearWithOrdinal = getOrdinal(Class);
                const title = `${yearWithOrdinal} Year ${Sec}`;
                res.render('allrecords', { records: results, title: title, dept: Dept, Class: Class, Sec: Sec, specificClass: true });
            }
        );
    });
});

app.get('/lateattendance/fetchStudentDetails', (req, res) => {
    const regNo = req.query.reg_no;
    db.query('SELECT * FROM student_data WHERE Reg_No = ?', [regNo], (err, result) => {
        if (err || result.length === 0) return res.render("studentDetails", { title: "Student Details" });

        db.query('SELECT * FROM student_absent_data WHERE Reg_No = ? ORDER BY Late_Date DESC', [regNo], (err, result2) => {
            if (err) return res.send('Error fetching attendance records');
            res.render('studentDetails', {
                title: "Student Detail",
                student: result[0],
                attendanceRecords: result2,
            });
        });
    });
});

app.post('/lateattendance/fetch-student/:Reg_no', authenticateJWT([1, 2, 3, 4]), (req, res) => {
    const regNo = req.params.Reg_no;
    db.query('SELECT * FROM student_data WHERE Reg_no = ?', [regNo], (err, results) => {
        if (err) return res.status(500).json({ error: err });
        if (results.length === 0) return res.status(404).json({ message: 'Student not found.' });
        res.json(results[0]);
    });
});

app.post('/lateattendance/save-absence', authenticateJWT([1, 2, 3, 4]), (req, res) => {
    const rollNumber = req.body.Reg_no2;
    const reason = req.body.reason;

    db.query(
        'INSERT INTO student_absent_data (Reg_no, reason, Staff_Reg_No) VALUES (?, ?, ?)',
        [rollNumber, reason, req.user.Reg_No],
        (err) => {
            if (err) return res.status(500).send(err);

            const monthAgo = new Date();
            monthAgo.setMonth(monthAgo.getMonth() - 1);

            db.query(
                'SELECT COUNT(*) as c FROM student_absent_data WHERE Reg_No = ? AND Late_Date >= ?',
                [rollNumber, monthAgo],
                (err, results) => {
                    if (err) return res.status(500).send(err);
                    const totalAbsences = results[0].c;

                    db.query('SELECT * FROM student_data WHERE Reg_No = ?', [rollNumber], (err, results1) => {
                        if (err) return res.status(500).send(err);
                        const name = results1[0].Student_Name;
                        const dept = results1[0].Department;
                        const sect = results1[0].Section;
                        const msg = totalAbsences > 3
                            ? `Student ${name} from ${dept} ${sect} has been late for ${totalAbsences} days in the last 30 days. Please inform the tutor.`
                            : `${name} from ${dept} ${sect} has been late for ${totalAbsences} days`;

                        res.status(200).json({
                            success: true,
                            message: "Absence Successfully Submitted",
                            late_attendance_count: totalAbsences,
                            msg: msg,
                        });
                    });
                }
            );
        }
    );
});

app.get('/lateattendance/attendanceRecordsAll', authenticateJWT([3, 4]), (req, res) => {
    const dept = req.user.Dept;
    const accessRole = req.user.accessRole;
    const msg = req.query.msg;
    const query = accessRole === 4
        ? `SELECT a.Reg_No, Late_Date, Student_Name, Section, YearOfStudy, Reason 
           FROM student_absent_data a, student_data b 
           WHERE a.Reg_no = b.Reg_no 
           ORDER BY YearOfStudy, Section`
        : `SELECT a.Reg_No, Late_Date, Student_Name, Section, YearOfStudy, Reason 
           FROM student_absent_data a, student_data b 
           WHERE a.Reg_no = b.Reg_no AND b.Department = ? 
           ORDER BY YearOfStudy, Section`;

    db.query(query, accessRole === 4 ? [] : [dept], (err, records) => {
        if (err) return res.status(500).send('Server error');
        res.render('allrecords', { 
            records: records, 
            title: accessRole === 4 ? 'All Records' : 'All classes', 
            dept: dept,
            msg: msg
        });
    });
});

app.get('/lateattendance/admin', authenticateJWT([3, 4]), (req, res) => {
    res.render('admin', { title: 'Admin Dashboard', message: null, error: null });
});

app.post('/lateattendance/admin/upload-student-data', authenticateJWT([3, 4]), upload.single('excel'), (req, res) => {
    try {
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet, { raw: false, dateNF: 'yyyy-mm-dd' });

        // Validate headers
        const requiredHeaders = ['Reg_No', 'Student_Name', 'Department', 'YearOfStudy', 'Section', 'Gender', 'Date_of_Birth', 'Mobile_no', 'Email', 'Address'];
        const excelHeaders = Object.keys(data[0] || {});
        const missingHeaders = requiredHeaders.filter(h => !excelHeaders.includes(h));
        if (missingHeaders.length > 0) {
            return res.render('admin', {
                title: 'Admin Dashboard',
                message: null,
                error: `Missing required columns: ${missingHeaders.join(', ')}`
            });
        }

        const values = data.map(row => {
            let dob = row.Date_of_Birth;
            if (typeof dob === 'number') {
                const excelEpoch = new Date(1899, 11, 30);
                dob = new Date(excelEpoch.getTime() + dob * 24 * 60 * 60 * 1000);
                dob = dob.toISOString().split('T')[0];
            } else if (dob instanceof Date) {
                dob = dob.toISOString().split('T')[0];
            } else if (typeof dob === 'string' && dob.match(/^\d{4}-\d{2}-\d{2}$/)) {
                // Already YYYY-MM-DD
            } else {
                dob = null;
            }

            return [
                row.Reg_No,
                row.Student_Name,
                row.Department,
                row.YearOfStudy,
                row.Section,
                row.Gender || null,
                dob,
                row.Mobile_no || null,
                row.Email || null,
                row.Address || null
            ];
        });

        const query = `
            INSERT INTO student_data
            (Reg_No, Student_Name, Department, YearOfStudy, Section, Gender, DOB, Mob_no, Mail_id, Residence)
            VALUES ?`;

        db.query(query, [values], (err) => {
            if (err) {
                console.error('SQL Error:', err.message);
                return res.render('admin', {
                    title: 'Admin Dashboard',
                    message: null,
                    error: 'Upload failed: ' + err.message
                });
            }
            res.redirect('/lateattendance/admin/view-students?msg=' + encodeURIComponent('Student data uploaded successfully!'));
        });
    } catch (err) {
        console.error('Excel Error:', err.message);
        res.render('admin', {
            title: 'Admin Dashboard',
            message: null,
            error: 'Invalid Excel format: ' + err.message
        });
    }
});

app.post('/lateattendance/admin/upload-staff-data', authenticateJWT([3, 4]), upload.single('excel'), (req, res) => {
    try {
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet);

        // Validate headers
        const requiredHeaders = ['Reg_No', 'Password', 'Staff_Name', 'Department', 'Mail_Id', 'Mob_No', 'Access_Role', 'YearOfClass', 'Section'];
        const excelHeaders = Object.keys(data[0] || {});
        const missingHeaders = requiredHeaders.filter(h => !excelHeaders.includes(h));
        if (missingHeaders.length > 0) {
            return res.render('admin', {
                title: 'Admin Dashboard',
                message: null,
                error: `Missing required columns: ${missingHeaders.join(', ')}`
            });
        }

        const values = data.map(row => [
            row.Reg_No,
            row.Password || null,
            row.Staff_Name || null,
            row.Department || null,
            row.Mail_Id || null,
            row.Mob_No || null,
            row.Access_Role || null,
            row.YearOfClass || null,
            row.Section || null
        ]);

        const query = `
            INSERT INTO staff_data
            (Reg_No, Password, Staff_Name, Department, Mail_Id, Mob_No, Access_Role, YearOfClass, Section)
            VALUES ?`;

        db.query(query, [values], (err, result) => {
            if (err) {
                console.error('SQL Error:', err.message);
                return res.render('admin', {
                    title: 'Admin Dashboard',
                    message: null,
                    error: 'Upload failed: ' + err.message
                });
            }
            res.redirect('/lateattendance/admin/view-staff?msg=' + encodeURIComponent('Staff data uploaded successfully!'));
        });
    } catch (err) {
        console.error('Excel Error:', err.message);
        res.render('admin', {
            title: 'Admin Dashboard',
            message: null,
            error: 'Invalid Excel format: ' + err.message
        });
    }
});

app.get('/lateattendance/admin/view-students', authenticateJWT([3, 4]), (req, res) => {
    const msg = req.query.msg;
    const query = 'SELECT Reg_No, Student_Name, Department, YearOfStudy, Section, Gender, DOB, Mob_no, Mail_id, Residence FROM student_data ORDER BY Reg_No';
    db.query(query, (err, results) => {
        if (err) {
            console.error('View Students Error:', err.message);
            return res.render('admin', {
                title: 'Admin Dashboard',
                message: null,
                error: 'Error fetching student data: ' + err.message
            });
        }
        res.render('viewStudents', {
            title: 'Uploaded Students',
            students: results,
            msg: msg,
            error: null
        });
    });
});
app.get('/lateattendance/admin/edit-staff/:Reg_No', authenticateJWT([3, 4]), (req, res) => {
    const Reg_No = req.params.Reg_No;
    const query = 'SELECT Reg_No, Password, Staff_Name, Department, Mail_Id, Mob_No, Access_Role, YearOfClass, Section FROM staff_data WHERE Reg_No = ?';
    db.query(query, [Reg_No], (err, results) => {
        if (err || results.length === 0) {
            console.error('Fetch Staff Error:', err ? err.message : 'No staff found');
            return res.render('viewStaff', {
                title: 'Uploaded Staff',
                staff: [],
                msg: null,
                error: 'Staff not found or error fetching data'
            });
        }
        res.render('editStaff', {
            title: 'Edit Staff',
            staff: results[0],
            error: null
        });
    });
});

app.post('/lateattendance/admin/update-staff/:Reg_No', authenticateJWT([3, 4]), (req, res) => {
    const Reg_No = req.params.Reg_No;
    const { Password, Staff_Name, Department, Mail_Id, Mob_No, Access_Role, YearOfClass, Section } = req.body;

    // Validate input
    if (Department && Department.length > 5) {
        return res.render('editStaff', {
            title: 'Edit Staff',
            staff: { Reg_No, Password, Staff_Name, Department, Mail_Id, Mob_No, Access_Role, YearOfClass, Section },
            error: 'Department must be 5 characters or less'
        });
    }
    if (Mail_Id && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(Mail_Id)) {
        return res.render('editStaff', {
            title: 'Edit Staff',
            staff: { Reg_No, Password, Staff_Name, Department, Mail_Id, Mob_No, Access_Role, YearOfClass, Section },
            error: 'Invalid email format'
        });
    }
    if (Mob_No && !/^\d{10,15}$/.test(Mob_No)) {
        return res.render('editStaff', {
            title: 'Edit Staff',
            staff: { Reg_No, Password, Staff_Name, Department, Mail_Id, Mob_No, Access_Role, YearOfClass, Section },
            error: 'Mobile number must be 10-15 digits'
        });
    }
    if (Access_Role && !/^[1-4]$/.test(Access_Role)) {
        return res.render('editStaff', {
            title: 'Edit Staff',
            staff: { Reg_No, Password, Staff_Name, Department, Mail_Id, Mob_No, Access_Role, YearOfClass, Section },
            error: 'Access Role must be 1, 2, 3, or 4'
        });
    }

    const query = `
        UPDATE staff_data
        SET Password = ?, Staff_Name = ?, Department = ?, Mail_Id = ?, Mob_No = ?, Access_Role = ?, YearOfClass = ?, Section = ?
        WHERE Reg_No = ?`;
    const values = [
        Password || null,
        Staff_Name || null,
        Department || null,
        Mail_Id || null,
        Mob_No || null,
        Access_Role || null,
        YearOfClass || null,
        Section || null,
        Reg_No
    ];

    db.query(query, values, (err) => {
        if (err) {
            console.error('Update Staff Error:', err.message);
            return res.render('editStaff', {
                title: 'Edit Staff',
                staff: { Reg_No, Password, Staff_Name, Department, Mail_Id, Mob_No, Access_Role, YearOfClass, Section },
                error: 'Failed to update staff: ' + err.message
            });
        }
        res.redirect('/lateattendance/admin/view-staff?msg=' + encodeURIComponent('Staff updated successfully!'));
    });
});

app.get('/lateattendance/admin/view-staff', authenticateJWT([3, 4]), (req, res) => {
    const msg = req.query.msg;
    const query = 'SELECT Reg_No, Password, Staff_Name, Department, Mail_Id, Mob_No, Access_Role, YearOfClass, Section FROM staff_data ORDER BY Reg_No';
    db.query(query, (err, results) => {
        if (err) {
            console.error('View Staff Error:', err.message);
            return res.render('admin', {
                title: 'Admin Dashboard',
                message: null,
                error: 'Error fetching staff data: ' + err.message
            });
        }
        res.render('viewStaff', {
            title: 'Uploaded Staff',
            staff: results,
            msg: msg,
            error: null
        });
    });
});
app.get("/lateattendance/resetPassword", (req, res) => {
    res.render("resetpassword", { title: "Reset Password" });
});

app.post("/lateattendance/resetPassword", (req, res) => {
    res.send("Reset password logic TBD");
});

app.get("/lateattendance/student", (req, res) => {
    res.render("student", { title: "Student" });
});

app.all('*', (req, res) => {
    res.render('page404', { title: "404 Page" });
});

// Server
const PORT = process.env.PORT || portToUse;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});