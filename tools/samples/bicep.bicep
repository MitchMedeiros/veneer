// a storage account
param location string = resourceGroup().location
@minLength(3)
@maxLength(24)
param name string

var tags = {
  env: 'dev'
  owner: 'me'
}

resource storage 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: name
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  tags: tags
}

/* block */
output id string = storage.id
output enabled bool = true
module net './net.bicep' = if (length(name) > 3) {
  name: 'net-${name}'
}
