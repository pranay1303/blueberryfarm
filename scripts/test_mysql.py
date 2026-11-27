import pymysql

passwords = ['', 'root', 'admin', 'password', '123456', '1234', 'Pranit', 'pranit']
success = False

for pwd in passwords:
    try:
        conn = pymysql.connect(host='127.0.0.1', port=3306, user='root', password=pwd, connect_timeout=3)
        print(f"SUCCESS with root password: '{pwd}'")
        with conn.cursor() as cur:
            cur.execute("SHOW DATABASES;")
            print("Databases:", [row[0] for row in cur.fetchall()])
        conn.close()
        success = True
        break
    except pymysql.err.OperationalError as e:
        print(f"Attempt with '{pwd}': {e.args}")
    except Exception as e:
        print(f"Error '{pwd}': {e}")

if not success:
    print("Could not connect with standard test passwords.")

