# kb-solaria/run.py
import argparse
import asyncio
from kbunified import main as backend_main

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("config_file")
    
    # We parse known args to ignore any extra flags watchfiles might pass
    args, _ = parser.parse_known_args()
    
    backend_argv = [str(args.config_file)]
    
    # Note: In DEV mode, we don't pass --static-dir, so it defaults to None 
    # (API-only mode), which is exactly what we want for Vite.
    
    try:
        asyncio.run(backend_main(backend_argv))
    except KeyboardInterrupt:
        pass # Clean exit on Ctrl+C
