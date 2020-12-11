
apiKey=
apiSecret=
spread=
base=
stock=
baseexposure=
stockexposure=
basemax=
stockmax=

count=0
for i in "$@"; do
	case $1 in 
		--apiKey=*) 		shift
							apiKey="${i#*=}"
							;;
		--apiSecret=*) 		shift
							apiSecret="${i#*=}"
							;;
		--spread=*)	shift
							spread="${i#*=}"
							;;
		--baseexposure=* | -be=*)	shift
							baseexposure="${i#*=}"
							;;
		--stockexposure=* | -be=*)	shift
							stockexposure="${i#*=}"
							;;
		--basemax=* | -be=*)	shift
							basemax="${i#*=}"
							;;
		--stockmax=* | -be=*)	shift
							stockmax="${i#*=}"
							;;
		--base=* | -b=*)	shift
							base="${i#*=}"
							;;
		--stock=* | -s=*) 	shift
							stock="${i#*=}"
							;;
		--numorders=*)		shift
							numorders="${i#*=}"
							;;
		*) echo "invalid option passed in: $1"
			exit 1
	esac
	let count=count+1
done

if [ $count -lt 6 ]; then
	echo -e "\n Error: Not enough arguments provided; Please make sure you have read the documentation \n"
	exit 1
fi

node ./src/main.js --apiKey=$apiKey --apiSecret=$apiSecret --spread=$spread --base=$base --stock=$stock --baseexposure=$baseexposure --stockexposure=$stockexposure --basemax=$basemax --stockmax=$stockmax --numorders=$numorders &> logs/$stock.$base.log &



