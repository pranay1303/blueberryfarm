import pymysql
import sys

def init_mysql():
    try:
        conn = pymysql.connect(
            host='127.0.0.1',
            port=3306,
            user='root',
            password='Admin@123',
            autocommit=True
        )
        with conn.cursor() as cur:
            cur.execute("""
                CREATE DATABASE IF NOT EXISTS blueberry_resort
                CHARACTER SET utf8mb4
                COLLATE utf8mb4_unicode_ci;
            """)
            print("Database 'blueberry_resort' created or already exists.")

            cur.execute("""
                CREATE USER IF NOT EXISTS 'blueberry_app'@'localhost' IDENTIFIED BY 'Blueberry@Secure2026';
            """)
            cur.execute("""
                ALTER USER 'blueberry_app'@'localhost' IDENTIFIED BY 'Blueberry@Secure2026';
            """)
            cur.execute("""
                GRANT ALL PRIVILEGES ON blueberry_resort.* TO 'blueberry_app'@'localhost';
            """)
            cur.execute("FLUSH PRIVILEGES;")
            print("Dedicated user 'blueberry_app'@'localhost' configured with privileges on 'blueberry_resort'.")
        conn.close()

        # Test connecting as blueberry_app
        app_conn = pymysql.connect(
            host='127.0.0.1',
            port=3306,
            user='blueberry_app',
            password='Blueberry@Secure2026',
            database='blueberry_resort'
        )
        print("Successfully connected as 'blueberry_app' to 'blueberry_resort'!")
        app_conn.close()
        return True
    except Exception as e:
        print(f"Error initializing MySQL: {e}", file=sys.stderr)
        return False

if __name__ == '__main__':
    if not init_mysql():
        sys.exit(1)

