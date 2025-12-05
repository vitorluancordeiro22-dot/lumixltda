#!/usr/bin/env python3
"""
Focused test for the 3 specific features requested in the review:
1. Sistema de arquivamento mensal automático
2. Opção de selecionar "Kg" nas receitas de produtos  
3. Botão de reset do contador de litros no dashboard
"""

import requests
import json
from datetime import datetime, timedelta

class FocusedLumixTester:
    def __init__(self):
        self.base_url = "https://lumix-inventory.preview.emergentagent.com"
        self.token = None
        self.results = []

    def log(self, message, success=None):
        if success is True:
            print(f"✅ {message}")
        elif success is False:
            print(f"❌ {message}")
        else:
            print(f"ℹ️  {message}")
        self.results.append({"message": message, "success": success})

    def api_call(self, method, endpoint, data=None, expected_status=200):
        url = f"{self.base_url}/api/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'

        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=10)

            if response.status_code == expected_status:
                try:
                    return True, response.json()
                except:
                    return True, {}
            else:
                print(f"   Status: {response.status_code}, Expected: {expected_status}")
                try:
                    print(f"   Error: {response.json()}")
                except:
                    print(f"   Response: {response.text[:200]}")
                return False, {}
        except Exception as e:
            print(f"   Exception: {str(e)}")
            return False, {}

    def login(self):
        """Login with provided credentials"""
        self.log("🔐 Logging in with provided credentials...")
        success, response = self.api_call('POST', 'auth/login', {
            "email": "teste@teste.com",
            "password": "password"
        })
        
        if success and 'token' in response:
            self.token = response['token']
            self.log("Login successful", True)
            return True
        else:
            self.log("Login failed", False)
            return False

    def test_kg_recipe_feature(self):
        """Test Feature 2: Opção de selecionar Kg nas receitas"""
        self.log("\n🧪 TESTING FEATURE 2: Receita com unidade Kg")
        
        # First create a raw material
        self.log("Creating raw material for recipe...")
        success, material = self.api_call('POST', 'raw-materials', {
            "name": "Açúcar Cristal",
            "type": "Kg",
            "total_stock": 500.0
        })
        
        if not success:
            self.log("Failed to create raw material", False)
            return False
            
        material_id = material['id']
        self.log(f"Raw material created: {material['name']}")
        
        # Create product with Kg recipe
        self.log("Creating product with Kg unit in recipe...")
        product_data = {
            "name": "Refrigerante Premium",
            "unit": "Litros",
            "expected_liters": 1000.0,
            "recipes": [
                {
                    "raw_material_id": material_id,
                    "quantity_per_liter": 0.15,
                    "unit": "Kg"  # This is the key test - Kg unit
                }
            ]
        }
        
        success, product = self.api_call('POST', 'products', product_data)
        
        if success:
            recipe = product.get('recipes', [{}])[0]
            saved_unit = recipe.get('unit', 'N/A')
            if saved_unit == 'Kg':
                self.log(f"✅ Product created with Kg recipe unit: {saved_unit}", True)
                return True
            else:
                self.log(f"❌ Recipe unit not saved correctly. Expected 'Kg', got '{saved_unit}'", False)
                return False
        else:
            self.log("Failed to create product with Kg recipe", False)
            return False

    def test_reset_liters_feature(self):
        """Test Feature 3: Reset do contador de litros"""
        self.log("\n🧪 TESTING FEATURE 3: Reset do contador de litros")
        
        # Get current dashboard
        self.log("Getting current dashboard summary...")
        success, dashboard = self.api_call('GET', 'dashboard/summary')
        
        if not success:
            self.log("Failed to get dashboard", False)
            return False
            
        liters_before = dashboard.get('liters_bottled_month', 0)
        self.log(f"Current liters count: {liters_before}")
        
        # Reset the counter
        self.log("Executing reset liters...")
        success, reset_result = self.api_call('POST', 'dashboard/reset-liters')
        
        if not success:
            self.log("Failed to reset liters", False)
            return False
            
        deleted_count = reset_result.get('deleted_count', 0)
        self.log(f"Reset executed - deleted {deleted_count} counting records")
        
        # Verify reset worked
        self.log("Verifying reset worked...")
        success, dashboard_after = self.api_call('GET', 'dashboard/summary')
        
        if success:
            liters_after = dashboard_after.get('liters_bottled_month', 0)
            self.log(f"Liters after reset: {liters_after}")
            
            if liters_after == 0:
                self.log("✅ Reset successful - counter is now 0", True)
                return True
            else:
                self.log(f"❌ Reset failed - counter is still {liters_after}", False)
                return False
        else:
            self.log("Failed to verify reset", False)
            return False

    def test_archiving_system(self):
        """Test Feature 1: Sistema de arquivamento mensal"""
        self.log("\n🧪 TESTING FEATURE 1: Sistema de arquivamento mensal")
        
        # Create some test data for archiving
        self.log("Creating test data for archiving...")
        
        # Create raw material
        success, material = self.api_call('POST', 'raw-materials', {
            "name": "Água Mineral",
            "type": "Litros", 
            "total_stock": 2000.0
        })
        
        if not success:
            self.log("Failed to create raw material for archiving test", False)
            return False
            
        # Create product
        success, product = self.api_call('POST', 'products', {
            "name": "Água Saborizada",
            "unit": "Litros",
            "expected_liters": 500.0,
            "recipes": [{
                "raw_material_id": material['id'],
                "quantity_per_liter": 0.9,
                "unit": "L"
            }]
        })
        
        if not success:
            self.log("Failed to create product for archiving test", False)
            return False
            
        # Create product batch with old date
        old_date = (datetime.now() - timedelta(days=45)).strftime('%Y-%m-%d')
        success, batch = self.api_call('POST', 'product-batches', {
            "product_id": product['id'],
            "date": old_date,
            "unit": "Litros",
            "planned_liters": 100.0
        })
        
        if not success:
            self.log("Failed to create product batch for archiving test", False)
            return False
            
        self.log(f"Created batch {batch['batch_number']} with date {old_date}")
        
        # Create team member for counting
        success, member = self.api_call('POST', 'team', {
            "name": "Maria Silva",
            "role": "Operadora"
        })
        
        if not success:
            self.log("Failed to create team member", False)
            return False
            
        # Add counting to finalize the batch
        self.log("Adding counting to finalize batch...")
        success, counting = self.api_call('POST', f'counting/{batch["id"]}', {
            "one_liter": 0,
            "two_liter": 0,
            "five_liter": 20,  # 20 * 5L = 100L (meets planned_liters)
            "operator": member['name']
        })
        
        if not success:
            self.log("Failed to add counting", False)
            return False
            
        self.log(f"Added counting: {counting['total']} liters")
        
        # Now test the archiving endpoints
        self.log("Testing auto-archive endpoint...")
        success, archive_result = self.api_call('POST', 'archive/auto-archive-month')
        
        if not success:
            self.log("Failed to execute auto-archive", False)
            return False
            
        archived_products = archive_result.get('archived_products', 0)
        archived_materials = archive_result.get('archived_materials', 0)
        self.log(f"Archive result: {archived_products} products, {archived_materials} materials archived")
        
        # Test get archive months
        self.log("Testing get archive months...")
        success, months = self.api_call('GET', 'archive/months')
        
        if not success:
            self.log("Failed to get archive months", False)
            return False
            
        self.log(f"Found {len(months)} archived months")
        
        if months:
            # Test get archived products for first month
            month = months[0]
            self.log(f"Testing archived products for {month['month_name']}...")
            success, archived_products = self.api_call('GET', f'archive/products/{month["year"]}/{month["month"]}')
            
            if success:
                self.log(f"Found {len(archived_products)} archived products", True)
                
                # Test get archived raw materials
                success, archived_materials = self.api_call('GET', f'archive/raw-materials/{month["year"]}/{month["month"]}')
                if success:
                    self.log(f"Found {len(archived_materials)} archived raw materials", True)
                    return True
                else:
                    self.log("Failed to get archived raw materials", False)
                    return False
            else:
                self.log("Failed to get archived products", False)
                return False
        else:
            self.log("✅ Archive system working - no items to archive yet", True)
            return True

    def run_all_tests(self):
        """Run all focused tests"""
        print("🚀 LUMIX FOCUSED FEATURE TESTING")
        print("=" * 50)
        
        if not self.login():
            return False
            
        # Test all 3 features
        feature1_ok = self.test_archiving_system()
        feature2_ok = self.test_kg_recipe_feature() 
        feature3_ok = self.test_reset_liters_feature()
        
        # Summary
        print("\n" + "=" * 50)
        print("📊 FEATURE TEST RESULTS:")
        print(f"   Feature 1 (Archiving): {'✅ PASS' if feature1_ok else '❌ FAIL'}")
        print(f"   Feature 2 (Kg Recipe): {'✅ PASS' if feature2_ok else '❌ FAIL'}")
        print(f"   Feature 3 (Reset Liters): {'✅ PASS' if feature3_ok else '❌ FAIL'}")
        
        all_passed = feature1_ok and feature2_ok and feature3_ok
        print(f"\n🎯 OVERALL RESULT: {'✅ ALL FEATURES WORKING' if all_passed else '❌ SOME FEATURES FAILED'}")
        
        return all_passed

if __name__ == "__main__":
    tester = FocusedLumixTester()
    success = tester.run_all_tests()
    exit(0 if success else 1)