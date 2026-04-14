from pydantic import BaseModel, Field, field_validator
from typing import List, Optional

_PROFIL_GEO = frozenset({"national_tchad", "international", "inconnu"})


class CVResult(BaseModel):
    model_config = {"populate_by_name": True}

    score: int = Field(0, ge=0, le=100)
    nom: str = ""
    email: Optional[str] = None
    telephone: Optional[str] = None
    profil_geographique: str = "inconnu"
    niveau: str = ""
    annees_experience: Optional[int] = None
    points_forts: List[str] = Field(default_factory=list)
    points_faibles: List[str] = Field(default_factory=list)
    competences_cles: List[str] = Field(default_factory=list)
    recommandation: str = ""
    decision: str = "non"
    file: str = Field("", alias="_file")
    index: int = Field(0, alias="_index")
    error: Optional[str] = Field(None, alias="_error")

    @field_validator("profil_geographique", mode="before")
    @classmethod
    def _normalize_profil_geo(cls, v: object) -> str:
        if v is None or (isinstance(v, str) and not v.strip()):
            return "inconnu"
        s = str(v).strip()
        if s == "mixte":
            return "inconnu"
        return s if s in _PROFIL_GEO else "inconnu"


class ExportItem(BaseModel):
    model_config = {"populate_by_name": True}

    nom: str = ""
    email: Optional[str] = None
    telephone: Optional[str] = None
    score: int = 0
    decision: str = ""
    profil_geographique: str = "inconnu"
    niveau: str = ""
    annees_experience: Optional[int] = None
    points_forts: List[str] = Field(default_factory=list)
    points_faibles: List[str] = Field(default_factory=list)
    competences_cles: List[str] = Field(default_factory=list)
    recommandation: str = ""
    file: str = Field("", alias="_file")

    @field_validator("profil_geographique", mode="before")
    @classmethod
    def _normalize_profil_geo_export(cls, v: object) -> str:
        if v is None or (isinstance(v, str) and not v.strip()):
            return "inconnu"
        s = str(v).strip()
        if s == "mixte":
            return "inconnu"
        return s if s in _PROFIL_GEO else "inconnu"


class ExportExcelRequest(BaseModel):
    """Corps JSON pour l'export Excel (filtres côté client).

    `include_peut_etre` est ignoré pour l'export Excel (toutes les décisions sont incluses) ;
    il reste pour compatibilité avec d'anciens clients. La feuille « Top » liste les
    `top_n` meilleurs scores parmi les candidats avec score >= min_score.
    """

    results: List[ExportItem]
    min_score: int = Field(0, ge=0, le=100)
    include_peut_etre: bool = False
    top_n: int = Field(10, ge=1, le=50)
