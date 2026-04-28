from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Any, Dict, List, Optional

_PROFIL_GEO = frozenset({"national_tchad", "international", "inconnu"})


class CriteriaScores(BaseModel):
    """Per-criterion score breakdown returned by the LLM (FIX 7).

    Each field is capped at 20; their sum must equal the parent score field.
    Made a separate model so it can be None for legacy results or failed analyses.
    """
    adequation_poste: int = Field(0, ge=0, le=20)
    experience_sectorielle: int = Field(0, ge=0, le=20)
    diplomes_certifications: int = Field(0, ge=0, le=20)
    competences_techniques: int = Field(0, ge=0, le=20)
    stabilite_carriere: int = Field(0, ge=0, le=20)

    @model_validator(mode="before")
    @classmethod
    def _coerce_floats(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        for k in ("adequation_poste", "experience_sectorielle",
                  "diplomes_certifications", "competences_techniques",
                  "stabilite_carriere"):
            v = data.get(k)
            if v is not None:
                try:
                    data[k] = int(round(float(v)))
                except (TypeError, ValueError):
                    data[k] = 0
        return data


class CVResult(BaseModel):
    model_config = {"populate_by_name": True}

    score: int = Field(0, ge=0, le=100)
    criteria_scores: Optional[CriteriaScores] = None  # FIX 7
    nom: str = ""
    email: Optional[str] = None
    telephone: Optional[str] = None
    profil_geographique: str = "inconnu"
    niveau: str = ""
    annees_experience: Optional[int] = None
    postes_occupes: List[str] = Field(default_factory=list)
    diplomes: List[str] = Field(default_factory=list)
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
    postes_occupes: List[str] = Field(default_factory=list)
    diplomes: List[str] = Field(default_factory=list)
    points_forts: List[str] = Field(default_factory=list)
    points_faibles: List[str] = Field(default_factory=list)
    competences_cles: List[str] = Field(default_factory=list)
    recommandation: str = ""
    file: str = Field("", alias="_file")

    @model_validator(mode="before")
    @classmethod
    def _coerce_claude_output(cls, data: Any) -> Any:
        """Tolère les valeurs imprécises que Claude peut retourner (float pour int, null pour str, etc.)."""
        if not isinstance(data, dict):
            return data
        # annees_experience et score peuvent être des floats (ex: 0.4, 5.0)
        for field in ("annees_experience", "score"):
            v = data.get(field)
            if v is not None:
                try:
                    data[field] = int(round(float(v)))
                except (TypeError, ValueError):
                    data[field] = 0 if field == "score" else None
        # Les champs str ne doivent pas être null
        for field in ("nom", "decision", "niveau", "recommandation"):
            if data.get(field) is None:
                data[field] = ""
        # Les listes ne doivent pas être null
        for field in ("points_forts", "points_faibles", "competences_cles"):
            v = data.get(field)
            if not isinstance(v, list):
                data[field] = []
        return data

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
