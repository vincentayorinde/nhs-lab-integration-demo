-- Illustrative Microsoft SQL Server schema only. The static browser demo does not connect to a database.
-- Synthetic demonstration records only; not designed for clinical deployment.
CREATE TABLE dbo.DemoPatients (
    PatientId NVARCHAR(64) NOT NULL PRIMARY KEY,
    DisplayName NVARCHAR(200) NOT NULL
);
CREATE TABLE dbo.DemoTestOrders (
    OrderId NVARCHAR(64) NOT NULL PRIMARY KEY,
    PatientId NVARCHAR(64) NOT NULL,
    TestCode NVARCHAR(80) NOT NULL,
    OrderStatus VARCHAR(24) NOT NULL CHECK (OrderStatus IN ('requested','received','completed')),
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_Orders_Patients FOREIGN KEY (PatientId) REFERENCES dbo.DemoPatients(PatientId)
);
CREATE TABLE dbo.DemoSpecimens (
    SpecimenId NVARCHAR(64) NOT NULL PRIMARY KEY,
    OrderId NVARCHAR(64) NOT NULL UNIQUE,
    ReceivedAt DATETIME2 NULL,
    CONSTRAINT FK_Specimens_Orders FOREIGN KEY (OrderId) REFERENCES dbo.DemoTestOrders(OrderId)
);
CREATE TABLE dbo.DemoResults (
    ResultId NVARCHAR(64) NOT NULL PRIMARY KEY,
    SpecimenId NVARCHAR(64) NOT NULL,
    ResultText NVARCHAR(400) NOT NULL,
    VerifiedAt DATETIME2 NULL,
    CONSTRAINT FK_Results_Specimens FOREIGN KEY (SpecimenId) REFERENCES dbo.DemoSpecimens(SpecimenId)
);
CREATE TABLE dbo.DemoInboundMessages (
    MessageId NVARCHAR(64) NOT NULL PRIMARY KEY,
    ReceivedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    ProcessingStatus VARCHAR(20) NOT NULL
);
