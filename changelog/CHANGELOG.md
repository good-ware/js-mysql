# @goodware/mysql Release History

## 5.0.5 2022-09-07

Update documentation

## 5.0.4 2022-05-14

Roll back previous change. Do not allow ssl to be an empty string. mysql2 doesn't allow it.

## 5.0.3 2022-05-10

Allow ssl to be an empty string

## 5.0.0 - 5.0.1 2022-05-09

### Breaking Changes

- Do not default ssl to 'Amazon RDS' when ssl isn't provided

This fixes an issue particularly for AWS China where ssl is not supported by IAM passwordless login. In other words, for the constructor options, `useIAM` is `true` and ssl is unspecified. In previous releases, ssl was automatically set to Amazon RDS when useIAM was specified.

### Other Changes

- Add aws-sdk 2.0 as a dependency (no longer optional)

## 4.0.0 - 4.0.5 2022-03-26

- aws-sdk is an optional dependency
- Load aws-sdk only if needed

## 3.0.9 2021-12-11

Decrease size of package by removing docs

## 3.0.8 2021-06-07

Log using tag 'db' instead of mysql

## 3.0.7 2021-06-07

Update documentation

## 3.0.6 2021-06-07

- Upgrade to parse-duration 1.0.0
- Remove use of peer dependencies

