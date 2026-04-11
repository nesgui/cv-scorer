from pydantic import BaseModel, Field
from typing import List, Optional


class CVResult(BaseModel):
    model_config = {"populate_by_name": True}

    score: int = Field(0, ge=0, le=100)
    nom: str = ""
    email: Optional[str] = None
    telephone: Optional[str] = None
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


class ExportItem(BaseModel):
    model_config = {"populate_by_name": True}

    nom: str = ""
    email: Optional[str] = None
    telephone: Optional[str] = None
    score: int = 0
    decision: str = ""
    niveau: str = ""
    annees_experience: Optional[int] = None
    points_forts: List[str] = Field(default_factory=list)
    points_faibles: List[str] = Field(default_factory=list)
    competences_cles: List[str] = Field(default_factory=list)
    recommandation: str = ""
    file: str = Field("", alias="_file")


class ExportExcelRequest(BaseModel):
    """Corps JSON pour l'export Excel (filtres côté client)."""

    results: List[ExportItem]
    min_score: int = Field(0, ge=0, le=100)
    include_peut_etre: bool = False
    top_n: int = Field(10, ge=1, le=50)
