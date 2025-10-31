
import sqlite3
import os
import sys

def get_firefox_cookies(profile_path, domain_name):
    """
    Extracts cookies for a specific domain from a Firefox profile.

    Args:
        profile_path (str): The path to the Firefox profile directory.
        domain_name (str): The domain for which to extract cookies (e.g., '.youtube.com').

    Returns:
        str: The cookies in Netscape format, or None if an error occurs.
    """
    cookie_file = os.path.join(profile_path, 'cookies.sqlite')
    if not os.path.exists(cookie_file):
        print(f"Error: cookies.sqlite not found at {cookie_file}", file=sys.stderr)
        return None

    try:
        conn = sqlite3.connect(cookie_file)
        cursor = conn.cursor()

        # Query to select cookies for the specified domain
        cursor.execute("""
            SELECT host, path, isSecure, expiry, name, value
            FROM moz_cookies
            WHERE host LIKE ?
        """, (f'%{domain_name}',))

        cookies = []
        for host, path, is_secure, expiry, name, value in cursor.fetchall():
            cookies.append(
                f"{host}\\t{'TRUE' if host.startswith('.') else 'FALSE'}\\t{path}\\t{'TRUE' if is_secure else 'FALSE'}\\t{int(expiry)}\\t{name}\\t{value}"
            )

        conn.close()
        
        # Add the Netscape header
        header = "# Netscape HTTP Cookie File\\n"\
                 "# http://www.netscape.com/newsref/std/cookie_spec.html\\n"\
                 "# This is a generated file!  Do not edit.\\n\\n"
        
        return header + "\\n".join(cookies)

    except sqlite3.Error as e:
        print(f"SQLite error: {e}", file=sys.stderr)
        return None

if __name__ == '__main__':
    # Path to the Firefox profile
    # Replace with the correct profile path if necessary
    profile_path = os.path.expanduser('~\\AppData\\Roaming\\Mozilla\\Firefox\\Profiles\\p1cyms1t.default-release-1737904046507')
    
    # Domain to extract cookies for
    domain = '.youtube.com'

    # Get the cookies
    cookie_data = get_firefox_cookies(profile_path, domain)

    if cookie_data:
        # Save the cookies to a file
        with open('cookies.txt', 'w') as f:
            f.write(cookie_data)
        print("YouTube cookies have been successfully exported to cookies.txt")
    else:
        print("Could not export YouTube cookies.")

