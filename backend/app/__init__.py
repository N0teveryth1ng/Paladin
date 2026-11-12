"""Backend application package.

This file must exist. Without it, `app` resolves as a namespace package and an
unrelated `app` package elsewhere on PYTHONPATH (this machine has one) shadows
it. tests/test_model.py::test_model_package_resolves_inside_backend guards this.
"""
