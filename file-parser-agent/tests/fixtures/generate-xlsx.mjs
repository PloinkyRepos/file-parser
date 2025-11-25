#!/usr/bin/env node
import * as xlsxModule from 'xlsx';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const xlsxLib = xlsxModule.default || xlsxModule;
const __dirname = dirname(fileURLToPath(import.meta.url));

// Create a sample workbook with test data
const wb = xlsxLib.utils.book_new();

// Sheet 1: Employee data
const employeeData = [
    { ID: 1, Name: 'Alice Johnson', Department: 'Engineering', Salary: 95000 },
    { ID: 2, Name: 'Bob Smith', Department: 'Marketing', Salary: 75000 },
    { ID: 3, Name: 'Carol Williams', Department: 'Engineering', Salary: 105000 },
    { ID: 4, Name: 'David Brown', Department: 'Sales', Salary: 85000 },
    { ID: 5, Name: 'Eve Davis', Department: 'HR', Salary: 70000 }
];

const ws1 = xlsxLib.utils.json_to_sheet(employeeData);
xlsxLib.utils.book_append_sheet(wb, ws1, 'Employees');

// Sheet 2: Product inventory
const productData = [
    { SKU: 'PROD-001', Product: 'Laptop', Quantity: 45, Price: 1200 },
    { SKU: 'PROD-002', Product: 'Mouse', Quantity: 150, Price: 25 },
    { SKU: 'PROD-003', Product: 'Keyboard', Quantity: 80, Price: 75 }
];

const ws2 = xlsxLib.utils.json_to_sheet(productData);
xlsxLib.utils.book_append_sheet(wb, ws2, 'Inventory');

// Sheet 3: Empty sheet
const ws3 = xlsxLib.utils.json_to_sheet([]);
xlsxLib.utils.book_append_sheet(wb, ws3, 'EmptySheet');

// Write to file
const outputPath = join(__dirname, 'sample.xlsx');
xlsxLib.writeFile(wb, outputPath);

console.log(`Generated ${outputPath}`);
