-- Surface habitable (m²) extraite de la page detail. A executer une fois.
alter table immo_seen add column if not exists surface int;
