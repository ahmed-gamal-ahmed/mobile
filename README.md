Product Inventory PWA
A Progressive Web App (PWA) for managing product inventories via barcode scanning, Excel file uploads, and dynamic table visualization. Built with HTML, CSS, JavaScript, and Bootstrap.

Features
Core Functionality
Barcode Scanning : Enter barcodes to track scanned products.
Excel Import : Upload Excel files to populate the product database.
Dynamic Tables :
Scanned Products Table
Remaining Products Table (products not yet scanned)
Column visibility toggling
Highlighted "Sum of Work Quantity" column
Action Buttons :
Return products to the remaining list
Move products between tables
Persistent Data :
Scanned products and remaining products are saved to local storage.
Column visibility settings persist across sessions.
Customization :
Edit barcodes to map to original values.
Toggle focus mode for smooth scrolling after scanning.
Export Functionality :
Export scanned products to an Excel file with a scanner name.
PWA Features
Installable : Add to home screen for app-like experience.
Offline Support : Works offline with cached assets.
Responsive Design : Optimized for mobile and desktop.
Setup Instructions
Requirements
A modern web browser (Chrome, Firefox, Edge, Safari).
HTTPS for PWA features (use a local server like Live Server for development).
Installation
Clone or Download the repository.
Open index.html in your browser (or deploy to a server for PWA features).
Add to Home Screen (optional but recommended for PWA experience):
On mobile: Tap the "Add to Home Screen" prompt after visiting the app.
On desktop: Use Chrome's ⋮ > Add to Desktop option.
Usage Guide
Key Features Walkthrough
1. Upload Excel File
Click the "Upload Excel File" input in the sidebar.
Select an Excel file to populate the product database.
The app will auto-generate headers and tables.
2. Scan Barcodes
Enter a barcode in the "Enter Barcode" input field.
Press Enter to search for the product in the remaining list.
Scanned products appear in the "Scanned Products" table.
3. Toggle Columns
Use the "Column Visibility" buttons in the sidebar to hide/show columns.
Settings persist across sessions.
4. Return/Move Products
In the Scanned Products table, click "Return" to move items back to the remaining list.
In the Remaining Products table, click "Move" to add items to scanned products.
5. Export Data
Click "Export Scanned Products" to download an Excel file.
Enter a scanner name when prompted.
6. Edit Barcodes
Use the "Edit Barcodes" section to map new barcodes to original values (e.g., typos).
7. PWA Mode
Add the app to your home screen for offline access.
Works seamlessly on mobile and desktop.
Dependencies
Bootstrap 5 : For responsive UI components.
xlsx.js : For Excel file parsing and generation.
Local Storage : For persistent data storage.
Troubleshooting
Common Issues
Data Not Saving :
Clear browser cache or check local storage permissions.
Ensure the app is running on HTTPS (required for PWA features).
Offline Mode Not Working :
Verify the service worker is registered (check browser dev tools).
Mobile Layout Issues :
Use Chrome DevTools' Device Toolbar to test responsiveness.
Contributing
Fork the repository.
Make changes in a new branch.
Submit a pull request with clear documentation.
License
MIT License.
Copyright (c) 2024 [Ahmed-gamal].
