import socket

# UPDATE THESE TWO LINES WITH YOUR POOLER DETAILS FROM THE DASHBOARD
HOST = "aws-0-[your-region-here].pooler.supabase.com" 
PORT = 6543 

print(f"Testing IPv4 Pooler lookup for: {HOST}")

try:
    addr_info = socket.getaddrinfo(HOST, PORT, socket.AF_UNSPEC, socket.SOCK_STREAM)
    print("✅ Success! The Work PC can resolve the IPv4 Pooler address.")
    for info in addr_info:
        print(f"   -> Found Address: {info[4][0]}")
except socket.gaierror as e:
    print(f"❌ Lookup failed: {e}")
