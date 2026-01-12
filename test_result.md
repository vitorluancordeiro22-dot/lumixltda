# Test Results

## Test Run: 2025-01-12

### What to test:

1. **Duplicate Product Feature**
   - Go to Products page
   - Find the copy icon (📋) next to edit button on any product card
   - Click it and verify modal opens with "(Cópia)" appended to name
   - All data (unit, liters, recipes) should be copied
   - Save and verify new product is created

2. **Search Feature on Multiple Pages**
   - Products: Search field filters products by name
   - Raw Materials: Search field filters materials by name
   - Suppliers: Search field filters by name or contact
   - Team: Search field filters by name or role
   - Batch Management: Search field filters batches by number or product name

3. **Counting Page Improvements**
   - Select a product batch
   - Verify form scrolls into view automatically
   - Verify 500ml option exists for volume products
   - For Kg products (like Açúcar Refinado), verify weight options (330g, 500g, 1Kg) appear instead of volume

### Test Credentials
- Email: teste@teste.com
- Password: password
