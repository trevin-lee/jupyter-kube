# JupyterLab configuration for Kubernetes deployment
# Disable authentication for internal cluster access


c.ServerApp.token = '' # type: ignore 
c.ServerApp.password = '' #type: ignore
c.ServerApp.ip = '0.0.0.0' #type: ignore
c.ServerApp.allow_origin = '*' #type: ignore
c.ServerApp.allow_remote_access = True #type: ignore
c.ServerApp.disable_check_xsrf = True #type: ignore
c.ServerApp.port = 8888 #type: ignore

# Allow iframe embedding for Electron app integration
c.ServerApp.allow_iframe = True #type: ignore
c.ServerApp.tornado_settings = {
    'headers': {
        'Content-Security-Policy': "frame-ancestors 'self' *; script-src 'self' 'unsafe-inline' 'unsafe-eval' *; style-src 'self' 'unsafe-inline' *;",
    }
} #type: ignore