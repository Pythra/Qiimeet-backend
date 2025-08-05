# import os
import requests

PAYSTACK_SECRET_KEY = 'sk_test_4d98bfc2ab0ff20be5d6fbcad8bea103372d7e29'

url = 'https://api.paystack.co/transaction/initialize'
payload = {
    'email': 'test@example.com',  # Replace with a valid test email
    'amount': 5000  # Amount in kobo (e.g., 5000 = ₦50.00)
}
headers = {
    'Authorization': f'Bearer {PAYSTACK_SECRET_KEY}',
    'Content-Type': 'application/json',
}

response = requests.post(url, json=payload, headers=headers)
print('Status Code:', response.status_code)
print('Response:', response.json())