import logging
import os
import aiohttp
from aiohttp import web

# Set up logger
logger = logging.getLogger(__name__)

# Constants for configuration, can be overridden by environment variables
LICENSE_SERVER_URL = os.environ.get("LICENSE_SERVER_URL", "https://tis-license.in/api/")
HA_ADDRESS = os.environ.get("HA_ADDRESS", "http://homeassistant:8123")


class LicenseManager:
    """Handles the communication with license servers."""

    def __init__(self, ha_address=None, license_server_url=None):
        self.ha_address = ha_address or HA_ADDRESS
        self.license_server_url = license_server_url or LICENSE_SERVER_URL

    async def verify_license(self):
        """
        Fetches and verifies the license key.
        Matches the logic of the PHP fetchLicenseFromRemote function.
        """
        try:
            url_get_key = f"{self.ha_address.rstrip('/')}/api/get_key"

            async with aiohttp.ClientSession() as session:
                async with session.get(url_get_key, timeout=10) as resp:
                    logger.info(f"[LicenseManager] HA Response status: {resp.status}")
                    if resp.status == 200:
                        data = await resp.json()
                        if data and "key" in data:
                            key = data["key"]
                            verify_url = f"{self.license_server_url.rstrip('/')}/verify"

                            async with session.get(
                                verify_url, params={"mac": key}, timeout=10
                            ) as response:
                                if response.status == 200:
                                    res_json = await response.json()
                                    if res_json.get("status") == "success":
                                        logger.info(
                                            "[LicenseManager] ✅ License verification SUCCESSFUL"
                                        )
                                        return res_json
                                    else:
                                        logger.warning(
                                            f"[LicenseManager] ❌ License verification FAILED: {res_json.get('message')}"
                                        )

                                if response.status == 401:
                                    logger.error(
                                        "[LicenseManager] ❌ 401 Unauthorized: License expired"
                                    )
                                    return {"status": 401, "message": "License expired"}
                                elif response.status == 404:
                                    logger.error(
                                        "[LicenseManager] ❌ 404 Not Found: License endpoint issue"
                                    )
                                    return {"status": 404, "message": "Unauthorized"}

                                logger.error(
                                    f"[LicenseManager] ❌ Unexpected remote status: {response.status}"
                                )
                                return None
                        else:
                            logger.error(
                                "[LicenseManager] ❌ No 'key' field in HA JSON response"
                            )
                            return None
                    else:
                        logger.error(
                            f"[LicenseManager] ❌ Failed to connect to HA API. Status: {resp.status}"
                        )
                        return None
        except Exception as e:
            logger.error(
                f"[LicenseManager] ❌ Exception during verification: {str(e)}",
                exc_info=True,
            )
            return None


@web.middleware
async def license_middleware(request: web.Request, handler):
    """
    aiohttp middleware to protect routes.
    """
    # 1. Bypass check for health and utility routes, and static assets
    if request.path in ["/health", "/metrics", "/ca.crt"] or request.path.startswith("/ui/"):
        return await handler(request)

    # 2. Perform license check
    manager = LicenseManager()
    license_data = await manager.verify_license()

    if license_data and license_data.get("status") == "success":
        return await handler(request)

    # 3. Serve unauthorized HTML page if license verification failed
    status_int = 401
    if license_data and isinstance(license_data, dict):
        status = license_data.get("status", 401)
        try:
            status_int = int(status)
        except:
            status_int = 401

    unauth_path = os.path.join(
        os.path.dirname(__file__), "ui", "html", "unauthorized.html"
    )
    if os.path.exists(unauth_path):
        return web.FileResponse(unauth_path, status=status_int)

    return web.json_response(
        {"status": "error", "message": "Unauthorized: License verification failed"},
        status=status_int,
    )
