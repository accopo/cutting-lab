"""Terminate this job's worker when its owning local server exits."""
import ctypes
from ctypes import wintypes
import os
import sys
import time

parent_pid, worker_pid = map(int, sys.argv[1:3])
if sys.platform == 'win32':
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.OpenProcess.argtypes = (wintypes.DWORD, wintypes.BOOL, wintypes.DWORD)
    kernel.OpenProcess.restype = wintypes.HANDLE
    kernel.WaitForMultipleObjects.argtypes = (wintypes.DWORD, ctypes.POINTER(wintypes.HANDLE), wintypes.BOOL, wintypes.DWORD)
    kernel.WaitForMultipleObjects.restype = wintypes.DWORD
    kernel.TerminateProcess.argtypes = (wintypes.HANDLE, wintypes.UINT)
    kernel.CloseHandle.argtypes = (wintypes.HANDLE,)
    parent = kernel.OpenProcess(0x00100000, False, parent_pid)
    worker = kernel.OpenProcess(0x00100000 | 0x0001, False, worker_pid)
    if not worker: sys.exit(0)
    if not parent:
        kernel.TerminateProcess(worker, 90)
    else:
        handles = (wintypes.HANDLE * 2)(parent, worker)
        status = kernel.WaitForMultipleObjects(2, handles, False, 0xFFFFFFFF)
        if status == 0: kernel.TerminateProcess(worker, 90)
        kernel.CloseHandle(parent)
    kernel.CloseHandle(worker)
else:
    # Portable fallback. The shipped desktop environment is Windows.
    while True:
        try: os.kill(worker_pid, 0)
        except ProcessLookupError: break
        try: os.kill(parent_pid, 0)
        except ProcessLookupError:
            import signal
            os.kill(worker_pid, signal.SIGTERM)
            break
        time.sleep(.5)
