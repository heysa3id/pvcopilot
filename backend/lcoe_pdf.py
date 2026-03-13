"""
LCOE tool — PVSyst PDF parsing.
Re-exports the parser from pvsyst_parser so the server can load
LCOE-related logic from this module.
"""

from pvsyst_parser import parse_pvsyst_pdf

__all__ = ["parse_pvsyst_pdf"]
