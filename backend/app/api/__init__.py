"""Local FastAPI application for interactive generation.

Production code here never selects a fake client and never reads a provider key
directly; settings are loaded through :mod:`app.llm.settings` and clients are
supplied through an injectable FastAPI dependency.
"""
